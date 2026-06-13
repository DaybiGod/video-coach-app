/**
 * Stream en vivo hacia la PC mediante snapshots del preview (camino robusto).
 *
 * NO usa frame processors ni Images.loadFromRawPixelData: ese camino crasheaba
 * de forma nativa en nitro-image (ArrayBufferHolder.asOwning / UIImage.init
 * fromRawPixelData -> EXC_BREAKPOINT). En su lugar, un bucle en el hilo JS toma
 * `camera.takeSnapshot()` (Image nativa lista), la reduce y la codifica a JPEG.
 * Auto-regulado: el siguiente tick solo se programa cuando el anterior termino.
 */
import { useEffect, useRef } from 'react';
import type { CameraRef } from 'react-native-vision-camera';

import { STREAM_DEFAULTS } from '../config/constants';
import type { TcpCoachServer } from '../net/TcpCoachServer';
import { useAppStore } from '../state/appStore';

type ImageLike = {
  resizeAsync(w: number, h: number): Promise<ImageLike>;
  toEncodedImageDataAsync(format: string, quality?: number): Promise<{ buffer: ArrayBuffer }>;
  dispose?: () => void;
};

export interface StreamDiag {
  ref: boolean; // cameraRef.current poblado
  step: string; // ultima etapa alcanzada / motivo de salto
  err: string | null; // mensaje del ultimo error (truncado)
}

export function useLiveStream(
  server: TcpCoachServer,
  cameraRef: React.RefObject<CameraRef | null>,
) {
  const sentRef = useRef(0);
  const diagRef = useRef<StreamDiag>({ ref: false, step: 'init', err: null });

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      const { streamOn, maxFps } = useAppStore.getState();
      const cam = cameraRef.current;
      const d = diagRef.current;
      d.ref = !!cam;
      if (!cam) d.step = 'sin-ref';
      else if (!streamOn) d.step = 'stream-off';
      else if (!server.hasClient) d.step = 'sin-cliente';
      else {
        try {
          const jpegQuality = useAppStore.getState().jpegQuality; // 0-100
          d.step = 'takeSnapshot';
          const snapRaw = await (cam as unknown as { takeSnapshot?: () => Promise<unknown> })
            .takeSnapshot?.();
          if (!snapRaw) {
            d.step = 'snapshot-undefined';
          } else {
            const snap = snapRaw as ImageLike;
            d.step = 'resize';
            const small = await snap.resizeAsync(STREAM_DEFAULTS.width, STREAM_DEFAULTS.height);
            d.step = 'encode';
            const enc = await small.toEncodedImageDataAsync('jpg', jpegQuality);
            d.step = 'send';
            server.sendFrame(Date.now(), new Uint8Array(enc.buffer));
            sentRef.current += 1;
            d.step = 'ok';
            d.err = null;
            snap.dispose?.();
            small.dispose?.();
          }
        } catch (e) {
          d.err = (e instanceof Error ? e.message : String(e)).slice(0, 160);
        }
      }
      if (stopped) return;
      const fps = Math.max(1, Math.min(30, useAppStore.getState().maxFps));
      timer = setTimeout(tick, Math.round(1000 / fps));
    };

    timer = setTimeout(tick, 600); // pequeña espera a que el preview arranque
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [server, cameraRef]);

  const takeSentCount = (): number => {
    const n = sentRef.current;
    sentRef.current = 0;
    return n;
  };

  return { takeSentCount, getDiag: (): StreamDiag => ({ ...diagRef.current }) };
}
