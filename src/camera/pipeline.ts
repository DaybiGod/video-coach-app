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

export function useLiveStream(
  server: TcpCoachServer,
  cameraRef: React.RefObject<CameraRef | null>,
) {
  const sentRef = useRef(0);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stopped) return;
      const { streamOn, maxFps } = useAppStore.getState();
      const cam = cameraRef.current;
      if (cam && streamOn && server.hasClient) {
        try {
          const jpegQuality = useAppStore.getState().jpegQuality; // 0-100
          const snap = (await cam.takeSnapshot()) as unknown as ImageLike;
          const small = await snap.resizeAsync(STREAM_DEFAULTS.width, STREAM_DEFAULTS.height);
          const enc = await small.toEncodedImageDataAsync('jpg', jpegQuality);
          server.sendFrame(Date.now(), new Uint8Array(enc.buffer));
          sentRef.current += 1;
          snap.dispose?.();
          small.dispose?.();
        } catch {
          // preview no listo todavia, o snapshot fallo: saltar este tick
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

  return { takeSentCount };
}
