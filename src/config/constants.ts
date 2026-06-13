export const APP_VERSION = '0.1.0';
export const PROTO_VERSION = 1;

// La app ESCUCHA aqui; la PC se conecta (por Wi-Fi a nuestra IP, o por USB via usbmux).
export const SERVER_PORT = 47474;

// Stream de analisis hacia la PC (el video final se graba 4K local, esto es solo preview).
export const STREAM_DEFAULTS = {
  maxFps: 12,
  jpegQuality: 0.7, // 0..1 (nitro-image)
  width: 360, // retrato 9:16 → 360x640
  height: 640,
};

export const RECORDING_DEFAULTS = {
  fps: 30,
  enableAudio: true,
};

export const STATS_INTERVAL_MS = 2000;
export const FILE_CHUNK_SIZE = 1024 * 1024; // 1 MiB (limite del protocolo)
export const MAX_BYTES_IN_FLIGHT = 1_500_000; // backpressure: drop de FRAMEs por encima
// Tope de reintentos de entrega de un mismo archivo: rompe cualquier bucle de
// reconexion/reenvio (el contador se persiste ANTES de cada intento).
export const MAX_DELIVER_ATTEMPTS = 5;

export const STORAGE_KEYS = {
  pin: 'vc.pin',
  settings: 'vc.settings',
  pendingFile: 'vc.pendingFile',
};
