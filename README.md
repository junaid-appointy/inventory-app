# Field App

React Native / Expo app for gate-entry barcode scanning, product mapping, and
offline-first delivery receipts. Phase 1 of the Office Ops field-capture stack
(see `../2026-05-22_Field_App_Architecture_Analysis.md` and
`../PWA_vs_Native_Decision.md` for context).

> This folder is **independent** of the rest of the umbrella repo. It has its
> own `package.json`, no workspace links, and is intended to be lifted into its
> own GitHub repo when ready. It lives here only for shared context during
> early development.

## What it does (Phase 1)

- Scan barcodes (EAN/UPC/Code128/QR) with the device camera.
- If the barcode is unknown, register the product (name, category, unit).
- If known, show the matching open order line and capture received quantity.
- Everything is written to a local SQLite **outbox**. A background sync worker
  pushes the outbox to the ingest server when online.
- Big buttons, haptics, status badge — designed for low-literacy operators on
  cheap Androids.

Not in Phase 1: SSID/GPS pre-flight, BLE, photos, voice prompts, push, iOS
parity. Those are Phase 2/3 in the architecture doc.

## Stack

- Expo SDK 51 + React Native 0.74 + TypeScript
- `expo-camera` (built-in barcode scanning)
- `expo-sqlite` (local persistence)
- `@react-navigation/native-stack`
- `expo-haptics`, `expo-network`

## Prerequisites

- Node 18+ (`node -v`)
- A package manager (`npm`, `pnpm`, or `yarn`)
- An Android device with the **Expo Go** app, *or* Android Studio for a dev
  build, *or* a physical iOS device with Expo Go (iOS is best-effort for now)

> Camera barcode scanning works in Expo Go on SDK 51. Once you add native
> modules that Expo Go doesn't ship (ML Kit, BLE, Wi-Fi), you'll switch to
> `expo-dev-client` and a custom dev build.

## Install

```bash
cd field-app
npm install        # or: pnpm install / yarn
```

## Configure the backend URL

The app posts receipts to `${EXPO_PUBLIC_API_BASE_URL}/v1/capture/...`. Set it
before starting Metro:

```bash
# Android emulator → host machine
export EXPO_PUBLIC_API_BASE_URL="http://10.0.2.2:8080"

# Physical device on the same Wi-Fi as your laptop
export EXPO_PUBLIC_API_BASE_URL="http://192.168.X.Y:8080"

export EXPO_PUBLIC_SITE_ID="site-dev"
```

If no backend is running yet, the app still works fully offline — items
accumulate in the outbox and you can inspect them from the **Sync queue**
screen.

## Run

```bash
npm start          # opens Metro / Expo dev tools
```

Then:
- Press **a** to launch on a connected Android device/emulator, **or**
- Scan the QR code with **Expo Go** on your phone.

For a custom dev build (needed once you add native modules beyond Expo Go's
set):

```bash
npm run prebuild           # generates ios/ and android/ folders
npm run android            # build + install dev client on connected device
```

## Type-check

```bash
npm run lint               # tsc --noEmit
```

## Testing the golden path manually

1. Launch the app — you should see **Field App** home with a green
   "✓ All synced" badge.
2. Tap **Scan Item**, grant camera permission.
3. Point at any barcode (a product in your kitchen works). The app should
   navigate to **New product** because the barcode is unknown.
4. Type a name, pick category + unit, tap **Save & continue**.
5. You land on **Receive item**. Use ± / quick buttons to set qty. Tap
   **Confirm received**.
6. Back on Home, the badge should say "1 waiting to send" (or 0 if you have a
   backend running and reachable).
7. Tap **Sync queue** to see the outbox rows and their status. Pull to refresh
   triggers a sync attempt.
8. Scan the same barcode again → this time it skips registration and goes
   straight to the receiving screen with the product pre-filled.

## Server contract (what the outbox posts)

- `POST /v1/capture/receipt` — body:
  ```json
  {
    "id": "rcp_…",
    "order_id": null,
    "order_item_id": null,
    "barcode": "8901234567890",
    "product_name": "Tata Salt 1kg",
    "qty": 3,
    "scanned_at": 1716640000000
  }
  ```
- `POST /v1/capture/product` — body:
  ```json
  { "barcode": "8901234567890", "name": "Tata Salt 1kg", "category": "Grocery", "unit": "Piece" }
  ```
- Headers on every request: `X-Device-Id`, `X-Site-Id`.

The server is expected to be idempotent on the `id` field for receipts so
retries are safe.

## Project layout

```
field-app/
  App.tsx                       # boots DB + sync, mounts navigator
  index.ts                      # Expo entry
  app.json                      # Expo config (permissions, package id)
  src/
    config.ts                   # API URL, site id, sync interval
    db/                         # SQLite schema + CRUD
    sync/                       # outbox flusher + HTTP client
    screens/                    # Home / Scanner / Receiving / Register / Outbox / Orders
    components/                 # BigButton, QueueBadge
    navigation/                 # stack + route types
    theme/                      # colors, spacing, type scale
    utils/                      # haptics, deviceId
```

## When to graduate from Expo Go

Move to a custom dev build (`expo-dev-client` + `npm run android`) when you
add any of:
- ML Kit barcode scanner (faster than `expo-camera` on cheap devices)
- BLE (`react-native-ble-plx`)
- Wi-Fi SSID read (`react-native-wifi-reborn`)
- WorkManager-backed sync
- `react-native-vision-camera`

That's the Phase 2 step described in the architecture doc.
