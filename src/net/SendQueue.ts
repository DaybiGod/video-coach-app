/**
 * Cola de salida con backpressure (normativa del protocolo VCP/1):
 * - control (PONG/STATS/REC_STATUS/ERROR/JSON) SIEMPRE tiene prioridad,
 * - FRAME es un slot de 1: si la red va lenta, se sobrescribe (drop) y la
 *   latencia queda acotada,
 * - FILE_CHUNK se envia con await (el remitente espera el drain natural).
 *
 * CRITICO: react-native-tcp-socket lanza `throw 'Socket is closed.'` de forma
 * SINCRONA al escribir sobre un socket destruido (incluido desde el callback
 * nativo 'written'). En build Release esa excepcion no atrapada cierra la app.
 * Por eso TODA escritura va envuelta en try/catch y un throw se trata como cierre.
 */
import { Buffer } from 'buffer';

import { MAX_BYTES_IN_FLIGHT } from '../config/constants';

/** Vista estructural minima del socket (desacopla los tipos de react-native-tcp-socket). */
export interface WritableSocket {
  write(
    data: Uint8Array | string,
    encoding?: unknown,
    cb?: (err?: Error | null) => void,
  ): unknown;
}

export class SendQueue {
  private control: Uint8Array[] = [];
  private frameSlot: Uint8Array | null = null;
  private bytesInFlight = 0;
  private writing = false;
  private closed = false;
  private pendingChunkRejects = new Set<(err: Error) => void>();
  framesDropped = 0;

  constructor(private socket: WritableSocket) {}

  pushControl(data: Uint8Array): void {
    if (this.closed) return;
    this.control.push(data);
    this.pump();
  }

  pushFrame(data: Uint8Array): boolean {
    if (this.closed) return false;
    if (this.bytesInFlight > MAX_BYTES_IN_FLIGHT) {
      this.framesDropped += 1;
      return false;
    }
    if (this.frameSlot !== null) {
      this.framesDropped += 1; // sobrescribimos el frame viejo
    }
    this.frameSlot = data;
    this.pump();
    return true;
  }

  /** Envia un chunk de archivo y resuelve cuando el socket lo acepto (pacing natural). */
  sendChunk(data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error('socket cerrado'));
        return;
      }
      const len = data.length;
      this.bytesInFlight += len;
      let settled = false;
      const finish = (err?: Error | null) => {
        if (settled) return;
        settled = true;
        this.pendingChunkRejects.delete(rejectFn);
        this.bytesInFlight -= len;
        if (err) reject(err);
        else resolve();
        if (!this.closed) this.pump();
      };
      const rejectFn = (err: Error) => finish(err);
      this.pendingChunkRejects.add(rejectFn);
      try {
        this.socket.write(Buffer.from(data), undefined, (err?: Error | null) => finish(err));
      } catch (e) {
        // write() lanzo sincronicamente (socket destruido) -> cierre controlado, nunca crash
        this.close();
        finish(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.writing = false;
    this.control = [];
    this.frameSlot = null;
    // rechaza los chunks en vuelo para que deliver() falle rapido (no cuelga 60s)
    const rejects = [...this.pendingChunkRejects];
    this.pendingChunkRejects.clear();
    for (const r of rejects) {
      try {
        r(new Error('socket cerrado'));
      } catch {
        /* ignore */
      }
    }
  }

  private pump(): void {
    if (this.writing || this.closed) return;
    const next = this.control.shift() ?? this.takeFrame();
    if (next === null) return;
    this.writing = true;
    this.bytesInFlight += next.length;
    try {
      this.socket.write(Buffer.from(next), undefined, () => {
        this.bytesInFlight -= next.length;
        this.writing = false;
        this.pump();
      });
    } catch (e) {
      // write() lanzo sincronicamente sobre socket destruido -> tratar como cierre.
      // Sin esto la excepcion escapa al puente nativo y mata la app en Release.
      this.bytesInFlight -= next.length;
      this.writing = false;
      this.close();
    }
  }

  private takeFrame(): Uint8Array | null {
    const f = this.frameSlot;
    this.frameSlot = null;
    return f;
  }
}
