/**
 * OnnxFaceEmbedder — the real on-device face embedding, written behind the
 * FaceEmbedder interface. This is the Phase-2 "landmine" isolated: swapping it
 * in changes no screen or state-machine code.
 *
 * ⚠️ Not active by default. To go live you must:
 *   1. `npm i onnxruntime-react-native` (already in package.json) and rebuild
 *      the EAS dev-client — it is a native module, Metro hot-reload won't add
 *      it.
 *   2. Ship a quantized MobileFaceNet model at `assets/models/mobilefacenet.onnx`
 *      and pass its require()'d asset to the constructor.
 *   3. Provide a FacePreprocessor that decodes the captured photo, crops the
 *      face, resizes to 112x112, and returns a normalized NCHW Float32 tensor.
 *      (Vision-camera gives a still; the decode/crop needs an image lib — this
 *      is the remaining device-side work.)
 *
 * Until then `createEmbedder()` returns the StubFaceEmbedder so the gate runs.
 *
 * `onnxruntime-react-native` is loaded via a guarded dynamic import so this
 * file compiles and the app runs before the dependency is installed.
 */

import { EMBEDDING_DIM, type FaceEmbedder, type FaceFrame } from './embedder';

const ORT_MODULE = 'onnxruntime-react-native';

// Model input contract (MobileFaceNet): 1x3x112x112, pixels normalized to
// roughly [-1, 1] as (v - 127.5) / 128.
const FACE_SIZE = 112;

/** Turns a captured face frame into the model's input tensor. Device-specific
 *  (needs JPEG decode + crop + resize); injected so this file stays testable. */
export interface FacePreprocessor {
  toNCHW(frame: FaceFrame): Promise<Float32Array>;
}

async function loadOrt(): Promise<any | null> {
  try {
    const mod: any = await import(ORT_MODULE);
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}

export class OnnxFaceEmbedder implements FaceEmbedder {
  readonly backend = 'onnx-mobilefacenet';
  private session: any | null = null;

  constructor(
    private readonly modelAsset: number | string,
    private readonly preprocessor: FacePreprocessor,
  ) {}

  async warmup(): Promise<void> {
    if (this.session) return;
    const ort = await loadOrt();
    if (!ort?.InferenceSession) {
      throw new Error(
        'onnxruntime-react-native is not available. Install it and rebuild the dev-client.',
      );
    }
    // Asset resolution differs by how the model is bundled; a require()'d asset
    // resolves to a local uri via expo-asset before this call in practice.
    const modelPath = typeof this.modelAsset === 'string' ? this.modelAsset : String(this.modelAsset);
    this.session = await ort.InferenceSession.create(modelPath);
  }

  async embed(frame: FaceFrame): Promise<number[]> {
    await this.warmup();
    const ort = await loadOrt();
    if (!ort?.Tensor || !this.session) {
      throw new Error('ONNX session not ready');
    }
    const input = await this.preprocessor.toNCHW(frame);
    const tensor = new ort.Tensor('float32', input, [1, 3, FACE_SIZE, FACE_SIZE]);
    const inputName = this.session.inputNames?.[0] ?? 'input';
    const outputName = this.session.outputNames?.[0] ?? 'output';
    const result = await this.session.run({ [inputName]: tensor });
    const raw: Float32Array = result[outputName]?.data ?? result?.data;
    if (!raw || raw.length === 0) throw new Error('Empty embedding from model');
    return l2normalize(Array.from(raw).slice(0, EMBEDDING_DIM));
  }
}

function l2normalize(v: number[]): number[] {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}
