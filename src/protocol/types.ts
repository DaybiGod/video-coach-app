/**
 * Protocolo VCP/1 — espejo exacto de coach/protocol.py (la referencia es sim_phone.py).
 * Framing: [u8 tipo][u32 longitud big-endian][payload]
 */
export enum MsgType {
  HELLO = 0x01,
  AUTH = 0x02,
  INFO = 0x03,
  BYE = 0x04,
  FRAME = 0x10,
  STATS = 0x11,
  STREAM_CTL = 0x12,
  START_REC = 0x20,
  STOP_REC = 0x21,
  REC_STATUS = 0x22,
  FILE_META = 0x30,
  FILE_CHUNK = 0x31,
  FILE_END = 0x32,
  FILE_ACCEPT = 0x33,
  FILE_RESULT = 0x34,
  PING = 0x40,
  PONG = 0x41,
  ERROR = 0x7f,
}

export const MAX_CONTROL_LEN = 64 * 1024;
export const MAX_FRAME_LEN = 4 * 1024 * 1024;
export const MAX_FILE_CHUNK_LEN = 1024 * 1024 + 8;

export function maxLenFor(type: MsgType): number {
  switch (type) {
    case MsgType.FRAME:
      return MAX_FRAME_LEN;
    case MsgType.FILE_CHUNK:
      return MAX_FILE_CHUNK_LEN;
    default:
      return MAX_CONTROL_LEN;
  }
}

export const ERR = {
  authFailed: 'auth_failed',
  busy: 'busy',
  recFailed: 'rec_failed',
  fileAborted: 'file_aborted',
  protocol: 'protocol',
  unsupported: 'unsupported',
} as const;

export interface HelloMsg {
  proto: number;
  app: string;
  device: string;
  ios: string;
  name: string;
}

export interface AuthMsg {
  pin?: string;
  token?: string;
}

export interface InfoMsg {
  token: string;
  caps: { max_fps: number; can_4k: boolean; codecs: string[] };
  orientation: 'portrait' | 'landscape';
  stream_w: number;
  stream_h: number;
  battery: number | null;
  free_disk_mb: number | null;
}

export interface StatsMsg {
  fps_out: number;
  frames_dropped: number;
  battery: number | null;
  mic_level_db: number | null;
  rec: { recording: boolean; elapsed_s: number };
  free_disk_mb: number | null;
  stream_diag?: { ref: boolean; step: string; err: string | null }; // diagnostico temporal del stream
}

export interface StreamCtlMsg {
  stream?: 'on' | 'off';
  max_fps?: number;
  jpeg_quality?: number; // 0-100 (lado PC); se normaliza a 0-1 internamente
  max_width?: number;
}

export interface StartRecMsg {
  resolution?: string;
  fps?: number;
  codec_pref?: 'h264' | 'hevc';
}

export interface RecStatusMsg {
  recording: boolean;
  file?: string;
  elapsed_s: number;
  est_size_mb?: number;
  error?: string;
  fase?: string;
}

export interface FileMetaMsg {
  file_id: string;
  name: string;
  size: number;
  sha256: string;
  mime: string;
}

export interface FileAcceptMsg {
  file_id: string;
  offset: number;
}

export interface FileResultMsg {
  file_id: string;
  ok: boolean;
  error?: string;
}

export interface ErrorMsg {
  code: string;
  msg: string;
}
