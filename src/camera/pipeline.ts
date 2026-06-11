/**
 * Stream en vivo hacia la PC: frame output pequeno en RGB -> JPEG (nitro-image) -> TCP.
 *
 * El worklet SOLO copia el buffer y lo programa hacia el hilo JS (scheduleOnRN);
 * el gate de fps, el encode y el envio viven en JS. El backpressure real lo hace
 * SendQueue (slot de 1 frame): si la red va lenta los frames viejos se descartan.
 */
import { useMemo, useRef } from 'react';
import { Images } from 'react-native-nitro-image';
import { useFrameOutput } from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';

type ImagePixelFormat = Parameters<typeof Images.loadFromRawPixelData>[0]['pixelFormat'];

import { STREAM_DEFAULTS } from '../config/constants';
import type { TcpCoachServer } from '../net/TcpCoachServer';
import { useAppStore } from '../state/appStore';

interface FramePacket {
  pixels: ArrayBuffer;
  width: number;
  height: number;
  bytesPerRow: number;
  pixelFormat: string;
  tsMs: number;
}

function mapFormat(cameraFormat: string): { format: ImagePixelFormat; bpp: number } | null {
  switch (cameraFormat) {
    case 'rgb-bgra-8-bit':
      return { format: 'BGRA', bpp: 4 };
    case 'rgb-rgba-8-bit':
      return { format: 'RGBA', bpp: 4 };
    case 'rgb-rgb-8-bit':
      return { format: 'RGB', bpp: 3 };
    default:
      return null;
  }
}

/** RawPixelData exige filas compactas; los buffers de camara pueden traer padding. */
function tighten(
  pixels: ArrayBuffer,
  width: number,
  height: number,
  bytesPerRow: number,
  bpp: number,
): ArrayBuffer {
  const rowBytes = width * bpp;
  if (bytesPerRow === rowBytes) return pixels;
  const src = new Uint8Array(pixels);
  const dst = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    dst.set(src.subarray(y * bytesPerRow, y * bytesPerRow + rowBytes), y * rowBytes);
  }
  return dst.buffer;
}

export function useLiveStream(server: TcpCoachServer) {
  const lastSentAt = useRef(0);
  const sentCounter = useRef(0);

  const processFrame = useMemo(() => {
    return (packet: FramePacket): void => {
      void (async () => {
        const { streamOn, maxFps, jpegQuality } = useAppStore.getState();
        if (!streamOn || !server.hasClient) return;
        const now = Date.now();
        if (now - lastSentAt.current < 1000 / Math.max(1, maxFps)) return;
        lastSentAt.current = now;
        const mapped = mapFormat(packet.pixelFormat);
        if (mapped === null) return;
        try {
          const tight = tighten(
            packet.pixels, packet.width, packet.height, packet.bytesPerRow, mapped.bpp);
          const image = Images.loadFromRawPixelData({
            buffer: tight,
            width: packet.width,
            height: packet.height,
            pixelFormat: mapped.format,
          });
          const encoded = await image.toEncodedImageDataAsync('jpg', jpegQuality);
          if (server.sendFrame(packet.tsMs, new Uint8Array(encoded.buffer))) {
            sentCounter.current += 1;
          }
        } catch {
          // un frame fallido no es fatal: el siguiente lo reemplaza
        }
      })();
    };
  }, [server]);

  const frameOutput = useFrameOutput({
    targetResolution: { width: STREAM_DEFAULTS.width, height: STREAM_DEFAULTS.height },
    pixelFormat: 'rgb',
    dropFramesWhileBusy: true,
    onFrame(frame) {
      'worklet';
      try {
        const copy = frame.getPixelBuffer().slice(0);
        const packet: FramePacket = {
          pixels: copy,
          width: frame.width,
          height: frame.height,
          bytesPerRow: frame.bytesPerRow,
          pixelFormat: frame.pixelFormat,
          tsMs: Date.now(),
        };
        scheduleOnRN(processFrame, packet);
      } finally {
        frame.dispose();
      }
    },
  });

  const takeSentCount = (): number => {
    const n = sentCounter.current;
    sentCounter.current = 0;
    return n;
  };

  return { frameOutput, takeSentCount };
}
