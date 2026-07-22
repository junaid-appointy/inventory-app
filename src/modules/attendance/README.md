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

Runs on the current dev-client with **no new native deps**. The embedder is the
stub (`createEmbedder()` returns `StubFaceEmbedder`), so it exercises the full
flow — camera → capture → embed → server/offline route → result → outbox — but
does not recognise real faces. Geofence returns `null` until `expo-location` is
installed (guarded dynamic import, degrades gracefully).

## Going live (needs an EAS dev-client rebuild)

These are native modules — Metro hot-reload will not add them.

1. Install deps (lets `expo` pick SDK-compatible versions):
   ```
   npx expo install expo-location onnxruntime-react-native
   ```
2. `app.json` → add the `expo-location` config plugin with foreground-location
   permission strings, and confirm camera permission is present.
3. Ship a quantized **MobileFaceNet** model at
   `assets/models/mobilefacenet.onnx` (input `1x3x112x112`, output 192-d).
4. Provide a `FacePreprocessor` (decode the vision-camera still → crop face →
   resize 112x112 → normalized NCHW `Float32Array`). This is the remaining
   device-side work; see `core/onnxEmbedder.ts`.
5. In `core/embedderFactory.ts` set `FACE_MODEL` to the `require()`'d model
   asset and return `new OnnxFaceEmbedder(FACE_MODEL, preprocessor)`.
6. Rebuild: `npx eas build --profile development --platform android`, install,
   then `npm run start:dev-client`.

## Verify on real hardware (not simulator)

- Camera capture + ONNX embedding latency on a mid-range Android.
- Offline → reconnect: throttle offline, punch, reconnect, watch the outbox
  flush (`core/runtime.ts` `flushOutbox`).
- Geofence: confirm `mocked` is `true` under a fake-GPS app.
- Enrollment: seed the gallery via `POST /api/attendance/enroll` (ops-dashboard).
