/**
 * Grabacion 4K local + preparacion del archivo para entregar a la PC.
 * Flujo: startRecording -> stopRecording -> sha256 incremental -> pendiente persistido
 * -> FileSender lo entrega (con reanudacion) y solo entonces se borra el local.
 */
import * as Crypto from 'expo-crypto';
import { Paths } from 'expo-file-system';
import type { CameraVideoOutput, Recorder } from 'react-native-vision-camera';

import { hashFile, savePending, type PendingFile } from '../net/FileSender';
import { useAppStore } from '../state/appStore';

export class RecordingController {
  private recorder: Recorder | null = null;
  private stopping = false;

  constructor(
    private getVideoOutput: () => CameraVideoOutput | undefined,
    private onPendingReady: (pending: PendingFile) => void,
    private onStatus: (status: {
      recording: boolean;
      elapsed_s: number;
      fase?: string;
      error?: string;
    }) => void,
  ) {}

  get isRecording(): boolean {
    return this.recorder !== null;
  }

  async start(): Promise<void> {
    if (this.recorder) return;
    const videoOutput = this.getVideoOutput();
    if (!videoOutput) throw new Error('camara no lista');
    const name = `toma_${timestampName()}.mp4`;
    const filePath = `${documentsPath()}/${name}`;
    const recorder = await videoOutput.createRecorder({ filePath });
    this.recorder = recorder;
    const startedAt = Date.now();
    useAppStore.getState().set({ recPhase: 'grabando', recStartedAt: startedAt, lastError: null });
    await recorder.startRecording(
      (finishedPath: string) => void this.onFinished(finishedPath, name, startedAt),
      (error: unknown) => {
        this.recorder = null;
        const msg = error instanceof Error ? error.message : String(error);
        useAppStore.getState().set({ recPhase: 'inactivo', lastError: `grabacion: ${msg}` });
        this.onStatus({ recording: false, elapsed_s: 0, error: msg });
      },
    );
    this.onStatus({ recording: true, elapsed_s: 0 });
  }

  async stop(): Promise<void> {
    const recorder = this.recorder;
    if (!recorder || this.stopping) return;
    this.stopping = true;
    try {
      await recorder.stopRecording();
    } finally {
      this.stopping = false;
      this.recorder = null;
    }
  }

  private async onFinished(filePath: string, name: string, startedAt: number): Promise<void> {
    this.recorder = null;
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    const store = useAppStore.getState();
    store.set({ recPhase: 'preparando', recStartedAt: null });
    this.onStatus({ recording: false, elapsed_s: elapsed, fase: 'preparando' });
    try {
      const { size, sha256 } = await hashFile(filePath);
      const pending: PendingFile = {
        fileId: Crypto.randomUUID().replace(/-/g, '').slice(0, 12),
        path: filePath,
        name,
        size,
        sha256,
      };
      await savePending(pending);
      this.onPendingReady(pending);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      store.set({ recPhase: 'inactivo', lastError: `preparando archivo: ${msg}` });
      this.onStatus({ recording: false, elapsed_s: elapsed, error: msg });
    }
  }
}

function documentsPath(): string {
  // createRecorder espera ruta de sistema de archivos, no URL file://
  return Paths.document.uri.replace(/^file:\/\//, '');
}

function timestampName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}
