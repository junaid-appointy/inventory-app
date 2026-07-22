/**
 * Embedder selection. Returns the real ONNX embedder once a model asset is
 * bundled and the dev-client has been rebuilt with onnxruntime-react-native;
 * otherwise the stub, so the gate always runs.
 *
 * Flip FACE_MODEL to a require()'d model asset + a real FacePreprocessor to go
 * live. Keeping this the single decision point means no other file changes when
 * the model lands.
 */

import { StubFaceEmbedder, type FaceEmbedder } from './embedder';
// import { OnnxFaceEmbedder } from './onnxEmbedder';

// Set to a require('../../../assets/models/mobilefacenet.onnx') asset to enable
// the real embedder. Null keeps the stub active.
const FACE_MODEL: number | null = null;

export function createEmbedder(): FaceEmbedder {
  if (FACE_MODEL != null) {
    // return new OnnxFaceEmbedder(FACE_MODEL, realPreprocessor);
  }
  return new StubFaceEmbedder();
}
