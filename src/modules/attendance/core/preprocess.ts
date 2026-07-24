/**
 * FacePreprocessor implementation — turns a vision-camera still into the
 * MobileFaceNet input tensor without any frame-processor/worklet machinery.
 *
 * Pipeline: expo-image-manipulator resizes the capture to 112x112 (native,
 * fast) → jpeg-js decodes the JPEG to RGBA pixels (pure JS) → normalize to
 * NCHW Float32 in roughly [-1, 1] as (v - 127.5) / 128.
 *
 * Note: this resizes the whole frame to 112x112. For best accuracy the face
 * should already fill the frame (the gate frames a single face at arm's
 * length). A tighter face crop can be added by feeding MediaPipe/ML-Kit
 * bounding boxes here later; the tensor contract stays the same.
 */

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as jpeg from 'jpeg-js';

import type { FaceFrame } from './embedder';
import type { FacePreprocessor } from './onnxEmbedder';

const FACE_SIZE = 112;

function base64ToBytes(b64: string): Uint8Array {
  // Hermes (RN 0.74+) provides atob globally.
  const decode = (globalThis as unknown as { atob?: (s: string) => string }).atob;
  if (!decode) throw new Error('atob unavailable; cannot decode image');
  const bin = decode(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const facePreprocessor: FacePreprocessor = {
  async toNCHW(frame: FaceFrame): Promise<Float32Array> {
    const resized = await manipulateAsync(
      frame.uri,
      [{ resize: { width: FACE_SIZE, height: FACE_SIZE } }],
      { base64: true, format: SaveFormat.JPEG, compress: 1 },
    );
    if (!resized.base64) throw new Error('resize produced no image data');

    const { data, width, height } = jpeg.decode(base64ToBytes(resized.base64), {
      useTArray: true,
    });
    if (width !== FACE_SIZE || height !== FACE_SIZE) {
      throw new Error(`unexpected decoded size ${width}x${height}`);
    }

    const plane = FACE_SIZE * FACE_SIZE;
    const out = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      out[i] = (r - 127.5) / 128;
      out[plane + i] = (g - 127.5) / 128;
      out[2 * plane + i] = (b - 127.5) / 128;
    }
    return out;
  },
};
