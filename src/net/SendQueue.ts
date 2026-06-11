/**
 * Cola de salida con backpressure (normativa del protocolo VCP/1):
 * - control (PONG/STATS/REC_STATUS/ERROR/JSON) SIEMPRE tiene prioridad,
 * - FRAME es un slot de 1: si la red va lenta, se sobrescribe (drop) y la
 *   latencia queda acotada,
 * - FILE_CHUNK se envia con await (el remitente espera el drain natural).
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
      this.bytesInFlight += data.length;
      this.socket.write(Buffer.from(data), undefined, (err?: Error | null) => {
        this.bytesInFlight -= data.length;
        if (err) reject(err);
        else resolve();
        this.pump();
      });
    });
  }

  close(): void {
    this.closed = true;
    this.control = [];
    this.frameSlot = null;
  }

  private pump(): void {
    if (this.writing || this.closed) return;
    const next = this.control.shift() ?? this.takeFrame();
    if (next === null) return;
    this.writing = true;
    this.bytesInFlight += next.length;
    this.socket.write(Buffer.from(next), undefined, () => {
      this.bytesInFlight -= next.length;
      this.writing = false;
      this.pump();
    });
  }

  private takeFrame(): Uint8Array | null {
    const f = this.frameSlot;
    this.frameSlot = null;
    return f;
  }
}
