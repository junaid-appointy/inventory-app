/**
 * FaceEmbedder — the Phase-2 seam.
 *
 * The whole "on-device face recognition under React Native" risk is isolated
 * behind this interface. Phase 1 ships `StubFaceEmbedder` so the full gate
 * flow (camera → capture → match → result → outbox) is walkable and testable
 * on the current dev-client with no new native dependencies. Phase 2 drops a
 * real ONNX MobileFaceNet implementation in behind the same interface — no
 * screen or state-machine changes required.
 *
 * Contract: `embed` returns an L2-normalized 192-float vector. Treat the
 * output like a fingerprint — never log it, never persist a face crop.
 */

export const EMBEDDING_DIM = 192;

/** A captured still to embed. Phase 2's real embedder reads the file URI. */
export type FaceFrame = {
  /** Local file URI of the captured photo (vision-camera `takePhoto`). */
  uri: string;
  width: number;
  height: number;
};

export interface FaceEmbedder {
  /** Warm the model/runtime. Safe to call repeatedly; resolves once ready. */
  warmup(): Promise<void>;
  /** Produce an L2-normalized embedding for a captured face frame. */
  embed(frame: FaceFrame): Promise<number[]>;
  /** Human-readable backend id for diagnostics (e.g. "stub", "onnx-mobilefacenet"). */
  readonly backend: string;
}

/** Cosine similarity between two L2-normalized vectors. */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return -1;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

function l2normalize(v: number[]): number[] {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

/**
 * Deterministic placeholder embedder. Derives a stable pseudo-vector from the
 * frame URI so the same "face" (same capture) yields the same embedding within
 * a session — enough to exercise matching, result UI, and the outbox without a
 * real model. It does NOT recognise real faces; it is a flow stub only.
 */
export class StubFaceEmbedder implements FaceEmbedder {
  readonly backend = 'stub';

  async warmup(): Promise<void> {
    // Simulate model warmup latency so the UI's "Checking…" state is real.
    await new Promise((r) => setTimeout(r, 120));
  }

  async embed(frame: FaceFrame): Promise<number[]> {
    await new Promise((r) => setTimeout(r, 200));
    // Seeded PRNG (mulberry32) from a cheap hash of the frame URI.
    let seed = 0;
    for (let i = 0; i < frame.uri.length; i++) {
      seed = (seed * 31 + frame.uri.charCodeAt(i)) >>> 0;
    }
    const rand = mulberry32(seed);
    const v = Array.from({ length: EMBEDDING_DIM }, () => rand() * 2 - 1);
    return l2normalize(v);
  }
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
