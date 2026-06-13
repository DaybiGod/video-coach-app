/**
 * Orquestador de la app: servidor TCP + stream + grabacion + entrega de archivos.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  CommonResolutions,
  VisionCamera,
  useVideoOutput,
  type CameraOutput,
  type CameraRef,
} from 'react-native-vision-camera';

import { RecordingController } from '../camera/recording';
import { useLiveStream } from '../camera/pipeline';
import {
  MAX_DELIVER_ATTEMPTS,
  RECORDING_DEFAULTS,
  STATS_INTERVAL_MS,
  STORAGE_KEYS,
} from '../config/constants';
import { FileSender, loadPending, savePending, type PendingFile } from '../net/FileSender';
import { TcpCoachServer, type ServerHandlers } from '../net/TcpCoachServer';
import { ERR, MsgType } from '../protocol/types';
import { useAppStore } from '../state/appStore';

export function useCoachApp() {
  const set = useAppStore((s) => s.set);
  const [granted, setGranted] = useState(false);

  // El servidor se crea una sola vez; los handlers reales se enlazan despues (refs).
  const impl = useRef<Partial<ServerHandlers>>({});
  const server = useMemo(() => {
    const proxy: ServerHandlers = {
      onClientChange: (c, a) => impl.current.onClientChange?.(c, a),
      onStartRec: (o) => impl.current.onStartRec?.(o),
      onStopRec: () => impl.current.onStopRec?.(),
      onStreamCtl: (c) => impl.current.onStreamCtl?.(c),
      onFileAccept: (m) => impl.current.onFileAccept?.(m),
      onFileResult: (m) => impl.current.onFileResult?.(m),
      onAuthed: () => impl.current.onAuthed?.(),
    };
    return new TcpCoachServer(proxy);
  }, []);

  const videoOutput = useVideoOutput({
    targetResolution: CommonResolutions.UHD_16_9,
    enableAudio: RECORDING_DEFAULTS.enableAudio,
  });
  const videoOutputRef = useRef(videoOutput);
  videoOutputRef.current = videoOutput;

  // ref a la camara para tomar snapshots del preview (camino del stream en vivo)
  const cameraRef = useRef<CameraRef | null>(null);
  const { takeSentCount, getDiag } = useLiveStream(server, cameraRef);
  const getDiagRef = useRef(getDiag);
  getDiagRef.current = getDiag;

  const fileSender = useMemo(() => new FileSender(server), [server]);
  const batteryRef = useRef<number | null>(null);

  const recorder = useMemo(
    () =>
      new RecordingController(
        () => videoOutputRef.current,
        (pending) => void deliverRef.current?.(pending),
        (status) => server.sendJson(MsgType.REC_STATUS, status),
      ),
    [server],
  );
  const deliverRef = useRef<((p: PendingFile) => Promise<void>) | null>(null);

  useEffect(() => {
    let alive = true;

    const deliver = async (pending: PendingFile): Promise<void> => {
      const store = useAppStore.getState();
      if (!server.hasClient) {
        // quedara pendiente; onAuthed lo re-ofrece cuando la PC vuelva
        store.set({ recPhase: 'inactivo' });
        return;
      }
      // Tope de reintentos: el contador se persiste ANTES de la entrega, asi un
      // eventual crash igual consume un intento y el tope rompe cualquier bucle.
      const attempts = (pending.attempts ?? 0) + 1;
      if (attempts > MAX_DELIVER_ATTEMPTS) {
        await savePending(null); // el .mp4 queda en disco para entrega manual
        store.set({
          recPhase: 'inactivo',
          deliverPct: 0,
          lastError: `entrega fallida tras ${pending.attempts} intentos; archivo conservado en el telefono`,
        });
        return;
      }
      const tried: PendingFile = { ...pending, attempts };
      await savePending(tried);
      store.set({ recPhase: 'entregando', deliverPct: 0 });
      try {
        const ok = await fileSender.deliver(tried, (pct) =>
          useAppStore.getState().set({ deliverPct: pct }),
        );
        // en exito, FileSender.deliver ya hizo savePending(null) + delete
        useAppStore.getState().set({
          recPhase: 'inactivo',
          deliverPct: 0,
          lastError: ok ? null : 'la PC rechazo el archivo (sha256)',
        });
      } catch (e) {
        // corte de conexion: el pendiente (con attempts ya incrementado) persiste
        useAppStore.getState().set({
          recPhase: 'inactivo',
          deliverPct: 0,
          lastError: `entrega interrumpida (intento ${attempts}): ${e instanceof Error ? e.message : e}`,
        });
      }
    };
    deliverRef.current = deliver;

    impl.current = {
      onClientChange: (connected, address) => {
        if (!connected) fileSender.abortInflight('cliente desconectado');
        useAppStore.getState().set({
          clientConnected: connected,
          clientAddress: address ?? null,
        });
      },
      onStartRec: () => {
        recorder.start().catch((e) => {
          server.sendJson(MsgType.ERROR, { code: ERR.recFailed, msg: String(e) });
        });
      },
      onStopRec: () => {
        recorder.stop().catch((e) => {
          server.sendJson(MsgType.ERROR, { code: ERR.recFailed, msg: String(e) });
        });
      },
      onStreamCtl: (ctl) => {
        const patch: Record<string, unknown> = {};
        if (ctl.stream !== undefined) patch.streamOn = ctl.stream === 'on';
        if (ctl.max_fps !== undefined) patch.maxFps = Math.max(1, Math.min(30, ctl.max_fps));
        if (ctl.jpeg_quality !== undefined) {
          patch.jpegQuality = Math.max(20, Math.min(95, ctl.jpeg_quality));
        }
        useAppStore.getState().set(patch);
      },
      onFileAccept: fileSender.onFileAccept,
      onFileResult: fileSender.onFileResult,
      onAuthed: () => {
        void (async () => {
          try {
            const pending = await loadPending();
            if (pending && !fileSender.sending) await deliver(pending);
          } catch (e) {
            useAppStore.getState().set({
              lastError: `onAuthed: ${e instanceof Error ? e.message : String(e)}`,
            });
          }
        })();
      },
    };

    void (async () => {
      // permisos
      const cam = await VisionCamera.requestCameraPermission();
      const mic = await VisionCamera.requestMicrophonePermission();
      if (alive) setGranted(cam && mic);

      // PIN persistente
      let pin = await AsyncStorage.getItem(STORAGE_KEYS.pin);
      if (!pin) {
        pin = String(Math.floor(1000 + Math.random() * 9000));
        await AsyncStorage.setItem(STORAGE_KEYS.pin, pin);
      }
      server.pin = pin;
      server.deviceName = Platform.select({ ios: 'iPhone', default: 'movil' }) ?? 'movil';
      server.getBattery = () => batteryRef.current;

      await server.start();
      if (alive) set({ serverReady: true, pin });

      const ip = await Network.getIpAddressAsync().catch(() => null);
      if (alive) set({ myIp: ip && ip !== '0.0.0.0' ? ip : null });

      batteryRef.current = await Battery.getBatteryLevelAsync().catch(() => null);
    })();

    const batterySub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      batteryRef.current = batteryLevel;
    });

    // STATS cada 2 s
    const statsTimer = setInterval(() => {
      if (!server.hasClient) return;
      const { recPhase, recStartedAt } = useAppStore.getState();
      server.sendStats({
        fps_out: Math.round((takeSentCount() / (STATS_INTERVAL_MS / 1000)) * 10) / 10,
        frames_dropped: server.framesDropped,
        battery: batteryRef.current,
        mic_level_db: null,
        rec: {
          recording: recPhase === 'grabando',
          elapsed_s: recStartedAt ? Math.round((Date.now() - recStartedAt) / 1000) : 0,
        },
        free_disk_mb: null,
        stream_diag: getDiagRef.current(), // temporal: por que no salen frames
      });
    }, STATS_INTERVAL_MS);

    // REC_STATUS espontaneo cada segundo mientras graba
    const recTimer = setInterval(() => {
      const { recPhase, recStartedAt } = useAppStore.getState();
      if (recPhase === 'grabando' && recStartedAt && server.hasClient) {
        server.sendJson(MsgType.REC_STATUS, {
          recording: true,
          elapsed_s: Math.round((Date.now() - recStartedAt) / 1000),
        });
      }
    }, 1000);

    return () => {
      alive = false;
      clearInterval(statsTimer);
      clearInterval(recTimer);
      batterySub.remove();
      server.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server]);

  // Solo el output de video 4K; el stream en vivo usa takeSnapshot del preview.
  const outputs: CameraOutput[] = useMemo(
    () => [videoOutput].filter(Boolean) as CameraOutput[],
    [videoOutput],
  );

  const toggleRecording = async (): Promise<void> => {
    if (recorder.isRecording) await recorder.stop();
    else await recorder.start();
  };

  return { granted, outputs, toggleRecording, cameraRef };
}
