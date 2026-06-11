/**
 * Entrega del video maestro a la PC con reanudacion.
 *
 * Reglas del protocolo (docs/protocolo_vcp.md):
 * - file_id ESTABLE por archivo (se genera al crear la grabacion, nunca por intento),
 * - la app persiste el archivo pendiente hasta FILE_RESULT ok,
 * - al (re)conectarse, se re-ofrece automaticamente,
 * - FILE_META -> FILE_ACCEPT{offset} -> FILE_CHUNKs -> FILE_END -> FILE_RESULT.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import { sha256 } from 'js-sha256';

import { FILE_CHUNK_SIZE, STORAGE_KEYS } from '../config/constants';
import { encodeFileChunk } from '../protocol/framing';
import { FileAcceptMsg, FileResultMsg, MsgType } from '../protocol/types';
import type { TcpCoachServer } from './TcpCoachServer';

export interface PendingFile {
  fileId: string;
  path: string; // uri file:// dentro de Documents
  name: string;
  size: number;
  sha256: string;
}

export async function loadPending(): Promise<PendingFile | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.pendingFile);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as PendingFile;
    if (!new File(p.path).exists) {
      await AsyncStorage.removeItem(STORAGE_KEYS.pendingFile);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export async function savePending(p: PendingFile | null): Promise<void> {
  if (p === null) await AsyncStorage.removeItem(STORAGE_KEYS.pendingFile);
  else await AsyncStorage.setItem(STORAGE_KEYS.pendingFile, JSON.stringify(p));
}

/** sha256 incremental del archivo, leyendo por bloques (no carga todo en memoria). */
export async function hashFile(
  path: string,
  onProgress?: (pct: number) => void,
): Promise<{ size: number; sha256: string }> {
  const file = new File(path);
  const size = file.size ?? 0;
  const hasher = sha256.create();
  const handle = file.open();
  try {
    let read = 0;
    while (read < size) {
      const bytes = handle.readBytes(Math.min(FILE_CHUNK_SIZE, size - read));
      if (bytes.length === 0) break;
      hasher.update(bytes);
      read += bytes.length;
      onProgress?.(Math.round((100 * read) / size));
      // cede el hilo JS para no congelar la UI
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    handle.close();
  }
  return { size, sha256: hasher.hex() };
}

export class FileSender {
  private acceptResolve: ((msg: FileAcceptMsg) => void) | null = null;
  private resultResolve: ((msg: FileResultMsg) => void) | null = null;
  sending = false;

  constructor(private server: TcpCoachServer) {}

  /** Conectar a los handlers del servidor. */
  onFileAccept = (msg: FileAcceptMsg): void => {
    this.acceptResolve?.(msg);
    this.acceptResolve = null;
  };

  onFileResult = (msg: FileResultMsg): void => {
    this.resultResolve?.(msg);
    this.resultResolve = null;
  };

  /**
   * Envia el archivo pendiente. Devuelve true si la PC confirmo FILE_RESULT ok
   * (en ese caso borra el pendiente y el archivo local).
   */
  async deliver(pending: PendingFile, onProgress?: (pct: number) => void): Promise<boolean> {
    if (this.sending) return false;
    this.sending = true;
    try {
      this.server.sendJson(MsgType.FILE_META, {
        file_id: pending.fileId,
        name: pending.name,
        size: pending.size,
        sha256: pending.sha256,
        mime: 'video/mp4',
      });
      const accept = await this.waitAccept(30_000);
      if (accept.file_id !== pending.fileId) throw new Error('FILE_ACCEPT de otro archivo');
      let pos = Math.max(0, Math.min(accept.offset ?? 0, pending.size));

      const file = new File(pending.path);
      const handle = file.open();
      try {
        if (pos > 0) handle.offset = pos;
        while (pos < pending.size) {
          const bytes = handle.readBytes(Math.min(FILE_CHUNK_SIZE, pending.size - pos));
          if (bytes.length === 0) break;
          await this.server.sendChunk(encodeFileChunk(pos, bytes));
          pos += bytes.length;
          onProgress?.(Math.round((100 * pos) / pending.size));
        }
      } finally {
        handle.close();
      }

      this.server.sendJson(MsgType.FILE_END, { file_id: pending.fileId, sha256: pending.sha256 });
      const result = await this.waitResult(60_000);
      if (result.ok) {
        await savePending(null);
        try {
          new File(pending.path).delete();
        } catch {
          /* el video local es prescindible una vez entregado */
        }
        return true;
      }
      return false;
    } finally {
      this.sending = false;
    }
  }

  private waitAccept(timeoutMs: number): Promise<FileAcceptMsg> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout esperando FILE_ACCEPT')), timeoutMs);
      this.acceptResolve = (msg) => {
        clearTimeout(t);
        resolve(msg);
      };
    });
  }

  private waitResult(timeoutMs: number): Promise<FileResultMsg> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout esperando FILE_RESULT')), timeoutMs);
      this.resultResolve = (msg) => {
        clearTimeout(t);
        resolve(msg);
      };
    });
  }
}
