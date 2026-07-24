/**
 * Embedder selection — the single decision point. Returns the real ONNX
 * embedder once a model asset is bundled and the dev-client has been rebuilt
 * with onnxruntime-react-native; otherwise the stub, so the gate always runs.
 *
 * To go live (one drop-in): put the model at
 * `assets/models/mobilefacenet.onnx`, then set FACE_MODEL to the require below.
 * Everything else — preprocessor, asset resolution, inference — is already
 * wired. No other file changes.
 */

import { StubFaceEmbedder, type FaceEmbedder } from './embedder';
import { OnnxFaceEmbedder } from './onnxEmbedder';
import { facePreprocessor } from './preprocess';

// Keep null until the model binary exists — a require() of a missing asset
// breaks the Metro bundler. Flip to:
//   const FACE_MODEL = require('../../../../assets/models/mobilefacenet.onnx');
const FACE_MODEL: number | null = null;

export function createEmbedder(): FaceEmbedder {
  if (FACE_MODEL != null) {
    return new OnnxFaceEmbedder(FACE_MODEL, facePreprocessor);
  }
  return new StubFaceEmbedder();
}
