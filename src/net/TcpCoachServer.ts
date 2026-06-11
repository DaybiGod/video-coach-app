/**
 * Servidor TCP de la app (protocolo VCP/1). La PC siempre es el cliente.
 * Referencia de comportamiento: sim_phone.py del repo video-coach.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import TcpSocket from 'react-native-tcp-socket';

import { APP_VERSION, PROTO_VERSION, SERVER_PORT } from '../config/constants';
import {
  MessageParser,
  ProtocolError,
  encode,
  encodeFrame,
  encodeJson,
  encodePong,
  parseJson,
  parsePing,
} from '../protocol/framing';
import {
  ERR,
  FileAcceptMsg,
  FileResultMsg,
  InfoMsg,
  MsgType,
  StartRecMsg,
  StatsMsg,
  StreamCtlMsg,
} from '../protocol/types';
import { SendQueue, type WritableSocket } from './SendQueue';

/** Vista estructural minima de la conexion entrante (evita acoplarse a los tipos del lib). */
interface ServerSocket extends WritableSocket {
  on(event: string, cb: (arg?: unknown) => void): unknown;
  destroy(): void;
  address(): unknown;
}

export interface ServerHandlers {
  onClientChange: (connected: boolean, address?: string) => void;
  onStartRec: (opts: StartRecMsg) => void;
  onStopRec: () => void;
  onStreamCtl: (ctl: StreamCtlMsg) => void;
  onFileAccept: (msg: FileAcceptMsg) => void;
  onFileResult: (msg: FileResultMsg) => void;
  /** se llama tras cada AUTH exitosa (para re-ofrecer archivos pendientes) */
  onAuthed: () => void;
}

interface DeviceIds {
  token: string;
}

async function getDeviceToken(): Promise<string> {
  const KEY = 'vc.deviceToken';
  const existing = await AsyncStorage.getItem(KEY);
  if (existing) return existing;
  const token = Crypto.randomUUID().replace(/-/g, '');
  await AsyncStorage.setItem(KEY, token);
  return token;
}

export class TcpCoachServer {
  private server: ReturnType<typeof TcpSocket.createServer> | null = null;
  private active: ServerSocket | null = null;
  private queue: SendQueue | null = null;
  private token = '';
  pin: string = '';
  deviceName = 'iPhone';
  iosVersion = String(Platform.Version ?? '?');
  streamSize = { w: 360, h: 640 };
  getBattery: () => number | null = () => null;

  constructor(private handlers: ServerHandlers) {}

  async start(port: number = SERVER_PORT): Promise<void> {
    this.token = await getDeviceToken();
    this.server = TcpSocket.createServer((socket) =>
      this.handleConnection(socket as unknown as ServerSocket),
    );
    this.server.listen({ port, host: '0.0.0.0' });
  }

  stop(): void {
    this.dropActive();
    this.server?.close();
    this.server = null;
  }

  get hasClient(): boolean {
    return this.active !== null;
  }

  // ----------------------------------------------------------- envio

  sendFrame(tsMs: number, jpeg: Uint8Array): boolean {
    return this.queue?.pushFrame(encodeFrame(tsMs, jpeg)) ?? false;
  }

  sendJson(type: MsgType, obj: unknown): void {
    this.queue?.pushControl(encodeJson(type, obj));
  }

  sendStats(stats: StatsMsg): void {
    this.sendJson(MsgType.STATS, stats);
  }

  sendChunk(data: Uint8Array): Promise<void> {
    if (!this.queue) return Promise.reject(new Error('sin cliente'));
    return this.queue.sendChunk(data);
  }

  get framesDropped(): number {
    return this.queue?.framesDropped ?? 0;
  }

  // ----------------------------------------------------------- conexiones

  private handleConnection(socket: ServerSocket): void {
    const parser = new MessageParser();
    let authed = false;
    let attempts = 0;
    const queue = new SendQueue(socket);

    const hello = {
      proto: PROTO_VERSION,
      app: `video-coach-cam/${APP_VERSION}`,
      device: this.deviceName,
      ios: this.iosVersion,
      name: 'Video Coach Cam',
    };
    queue.pushControl(encodeJson(MsgType.HELLO, hello));

    const fail = (code: string, msg: string, close = false) => {
      queue.pushControl(encodeJson(MsgType.ERROR, { code, msg }));
      if (close) setTimeout(() => socket.destroy(), 150);
    };

    socket.on('data', (data?: unknown) => {
      const bytes =
        typeof data === 'string'
          ? new TextEncoder().encode(data)
          : new Uint8Array(data as ArrayBufferView as Uint8Array);
      let msgs;
      try {
        msgs = parser.feed(bytes);
      } catch (e) {
        if (e instanceof ProtocolError) {
          fail(ERR.protocol, e.message, true);
          return;
        }
        throw e;
      }
      for (const { type, payload } of msgs) {
        try {
          if (!authed) {
            if (type !== MsgType.AUTH) {
              fail(ERR.protocol, 'se esperaba AUTH', true);
              return;
            }
            const cred = parseJson<{ pin?: string; token?: string }>(payload);
            const ok =
              (cred.token && cred.token === this.token) ||
              (this.pin && cred.pin === this.pin);
            if (ok) {
              authed = true;
              this.promote(socket, queue);
              this.sendInfo();
              this.handlers.onAuthed();
            } else {
              attempts += 1;
              if (attempts >= 3) fail(ERR.authFailed, '3 intentos fallidos', true);
              else setTimeout(() => fail(ERR.authFailed, 'PIN incorrecto'), 900);
            }
            continue;
          }
          this.route(type, payload, queue);
        } catch (e) {
          if (e instanceof ProtocolError) {
            fail(ERR.protocol, e.message, true);
            return;
          }
          throw e;
        }
      }
    });

    const cleanup = () => {
      queue.close();
      if (this.active === socket) {
        this.active = null;
        this.queue = null;
        this.handlers.onClientChange(false);
      }
    };
    socket.on('error', cleanup);
    socket.on('close', cleanup);
  }

  private route(type: MsgType, payload: Uint8Array, queue: SendQueue): void {
    switch (type) {
      case MsgType.PING:
        queue.pushControl(encodePong(parsePing(payload), Date.now()));
        break;
      case MsgType.STREAM_CTL:
        this.handlers.onStreamCtl(parseJson<StreamCtlMsg>(payload));
        break;
      case MsgType.START_REC:
        this.handlers.onStartRec(parseJson<StartRecMsg>(payload));
        break;
      case MsgType.STOP_REC:
        this.handlers.onStopRec();
        break;
      case MsgType.FILE_ACCEPT:
        this.handlers.onFileAccept(parseJson<FileAcceptMsg>(payload));
        break;
      case MsgType.FILE_RESULT:
        this.handlers.onFileResult(parseJson<FileResultMsg>(payload));
        break;
      case MsgType.BYE:
        this.dropActive();
        break;
      case MsgType.PONG:
      case MsgType.STATS:
        break;
      default:
        queue.pushControl(
          encodeJson(MsgType.ERROR, { code: ERR.unsupported, msg: `tipo 0x${type.toString(16)}` }),
        );
    }
  }

  private promote(socket: ServerSocket, queue: SendQueue): void {
    const old = this.active;
    this.active = socket;
    this.queue = queue;
    if (old && old !== socket) {
      try {
        old.destroy();
      } catch {
        /* ya cerrado */
      }
    }
    const addr = (socket.address() as { address?: string } | null)?.address ?? undefined;
    this.handlers.onClientChange(true, addr);
  }

  private sendInfo(): void {
    const info: InfoMsg = {
      token: this.token,
      caps: { max_fps: 30, can_4k: true, codecs: ['h264', 'hevc'] },
      orientation: 'portrait',
      stream_w: this.streamSize.w,
      stream_h: this.streamSize.h,
      battery: this.getBattery(),
      free_disk_mb: null,
    };
    this.sendJson(MsgType.INFO, info);
  }

  private dropActive(): void {
    if (this.active) {
      try {
        this.active.destroy();
      } catch {
        /* ya cerrado */
      }
      this.active = null;
      this.queue = null;
      this.handlers.onClientChange(false);
    }
  }
}

export { encode, encodeJson };
