import { MsgType, maxLenFor } from './types';

export class ProtocolError extends Error {}

const HEADER_LEN = 5;

export function encode(type: MsgType, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  if (payload.length > maxLenFor(type)) {
    throw new ProtocolError(`payload de ${payload.length} bytes excede el limite`);
  }
  const out = new Uint8Array(HEADER_LEN + payload.length);
  const dv = new DataView(out.buffer);
  dv.setUint8(0, type);
  dv.setUint32(1, payload.length, false); // big-endian
  out.set(payload, HEADER_LEN);
  return out;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeJson(type: MsgType, obj: unknown): Uint8Array {
  return encode(type, textEncoder.encode(JSON.stringify(obj)));
}

export function encodeFrame(tsMs: number, jpeg: Uint8Array): Uint8Array {
  const payload = new Uint8Array(8 + jpeg.length);
  writeU64(payload, 0, tsMs);
  payload.set(jpeg, 8);
  return encode(MsgType.FRAME, payload);
}

export function encodeFileChunk(offset: number, data: Uint8Array): Uint8Array {
  const payload = new Uint8Array(8 + data.length);
  writeU64(payload, 0, offset);
  payload.set(data, 8);
  return encode(MsgType.FILE_CHUNK, payload);
}

export function encodePong(t0Ms: number, nowMs: number): Uint8Array {
  const payload = new Uint8Array(16);
  writeU64(payload, 0, t0Ms);
  writeU64(payload, 8, nowMs);
  return encode(MsgType.PONG, payload);
}

export function encodePing(t0Ms: number): Uint8Array {
  const payload = new Uint8Array(8);
  writeU64(payload, 0, t0Ms);
  return encode(MsgType.PING, payload);
}

export function parseJson<T = Record<string, unknown>>(payload: Uint8Array): T {
  let obj: unknown;
  try {
    obj = JSON.parse(textDecoder.decode(payload));
  } catch (e) {
    throw new ProtocolError(`JSON invalido: ${e}`);
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    throw new ProtocolError('el JSON debe ser un objeto');
  }
  return obj as T;
}

export function parsePing(payload: Uint8Array): number {
  if (payload.length !== 8) throw new ProtocolError('PING debe ser u64');
  return readU64(payload, 0);
}

/** u64 big-endian sobre Number (seguro hasta 2^53; sobra para epoch-ms y offsets). */
export function writeU64(buf: Uint8Array, at: number, value: number): void {
  const hi = Math.floor(value / 0x1_0000_0000);
  const lo = value >>> 0 === value ? value : value % 0x1_0000_0000;
  const dv = new DataView(buf.buffer, buf.byteOffset);
  dv.setUint32(at, hi, false);
  dv.setUint32(at + 4, lo >>> 0, false);
}

export function readU64(buf: Uint8Array, at: number): number {
  const dv = new DataView(buf.buffer, buf.byteOffset);
  const hi = dv.getUint32(at, false);
  const lo = dv.getUint32(at + 4, false);
  return hi * 0x1_0000_0000 + lo;
}

/** Parser incremental: feed(bytes) devuelve los mensajes completos. */
export class MessageParser {
  private chunks: Uint8Array[] = [];
  private total = 0;

  feed(data: Uint8Array): Array<{ type: MsgType; payload: Uint8Array }> {
    this.chunks.push(data);
    this.total += data.length;
    const out: Array<{ type: MsgType; payload: Uint8Array }> = [];
    for (;;) {
      if (this.total < HEADER_LEN) break;
      const header = this.peek(HEADER_LEN);
      const type = header[0] as MsgType;
      const dv = new DataView(header.buffer, header.byteOffset);
      const length = dv.getUint32(1, false);
      if (!(type in MsgType)) {
        throw new ProtocolError(`tipo desconocido 0x${type.toString(16)}`);
      }
      if (length > maxLenFor(type)) {
        throw new ProtocolError(`payload de ${length} bytes excede el limite`);
      }
      if (this.total < HEADER_LEN + length) break;
      const msg = this.take(HEADER_LEN + length);
      out.push({ type, payload: msg.subarray(HEADER_LEN) });
    }
    return out;
  }

  get pendingBytes(): number {
    return this.total;
  }

  private peek(n: number): Uint8Array {
    if (this.chunks.length > 0 && this.chunks[0].length >= n) return this.chunks[0];
    this.compact();
    return this.chunks[0] ?? new Uint8Array(0);
  }

  private take(n: number): Uint8Array {
    if (!(this.chunks.length > 0 && this.chunks[0].length >= n)) this.compact();
    const head = this.chunks[0];
    const msg = head.subarray(0, n);
    if (head.length === n) {
      this.chunks.shift();
    } else {
      this.chunks[0] = head.subarray(n);
    }
    this.total -= n;
    return msg;
  }

  private compact(): void {
    const all = new Uint8Array(this.total);
    let at = 0;
    for (const c of this.chunks) {
      all.set(c, at);
      at += c.length;
    }
    this.chunks = all.length ? [all] : [];
  }
}
