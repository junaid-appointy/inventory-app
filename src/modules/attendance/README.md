# attendance module

Face check-in / check-out gate, built into the field-app as a self-registered
module. Talks to the engine attendance plugin under `/api/attendance/*`.

## Architecture

```
screens/GateScreen.tsx        camera + state machine + result UI
core/machine.ts               pure gate state machine (reducer)
core/runtime.ts               online→server / offline→outbox routing, gallery sync
core/embedder.ts              FaceEmbedder interface + StubFaceEmbedder
core/onnxEmbedder.ts          real ONNX MobileFaceNet embedder (behind the interface)
core/embedderFactory.ts       picks stub vs onnx (single decision point)
core/geo.ts                   geofence signal + mock-location detection
api/client.ts                 typed engine client (x-guard-token auth)
db/store.ts                   cached gallery + offline outbox (expo-sqlite)
```

Server is source of truth: the app captures a face, computes a 192-float
embedding on-device, and accepts whatever the engine returns. Matching,
thresholds, dedupe, and geofence policy all live on the server.

## Current state

Everything is wired **except the trained model weights**. Deps are installed
(`expo-location`, `onnxruntime-react-native`, `expo-image-manipulator`,
`jpeg-js`), `app.json` has the location + onnx plugins and permissions, the
`FacePreprocessor` is implemented (`core/preprocess.ts`), asset resolution +
inference are done (`core/onnxEmbedder.ts`), and enrollment works
(`screens/EnrollScreen.tsx` → `POST /enroll`).

The embedder factory still returns `StubFaceEmbedder` because there is no model
binary yet — so the full flow (gate + enroll) runs and is walkable, but does
not recognise real faces. The stub is deterministic per capture, so it will not
match an enrolled face across two different photos; that is expected until the
real model lands.

## Going live — remaining steps

1. Drop a quantized **MobileFaceNet** ONNX model at
   `assets/models/mobilefacenet.onnx` (input `1x3x112x112`, output 192-d,
   normalized `(v-127.5)/128`). Public conversions exist (InsightFace /
   MobileFaceNet); pick one whose output dim matches `EMBEDDING_DIM` (192) or
   adjust that constant.
2. In `core/embedderFactory.ts` set `FACE_MODEL = require('../../../../assets/models/mobilefacenet.onnx')`.
   That single line activates `OnnxFaceEmbedder` for both the gate and enroll.
3. Rebuild the native client (deps + plugins changed):
   `npx eas build --profile development --platform android`, install, then
   `npm run start:dev-client`.
4. Enroll each staff member (gate AppBar → enroll icon, requires
   `attendance.enroll`), then validate recognition on-device.

> Note: `preprocess.ts` resizes the whole frame to 112x112. If accuracy needs a
> tighter crop, feed a face bounding box (ML Kit / MediaPipe) into the
> preprocessor — the tensor contract is unchanged.

## Verify on real hardware (not simulator)

- Camera capture + ONNX embedding latency on a mid-range Android.
- Offline → reconnect: throttle offline, punch, reconnect, watch the outbox
  flush (`core/runtime.ts` `flushOutbox`).
- Geofence: confirm `mocked` is `true` under a fake-GPS app.
- Enrollment: seed the gallery via `POST /api/attendance/enroll` (ops-dashboard).
