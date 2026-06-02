# Field Data Capture App — Architecture Analysis

**Date:** 2026-05-22
**Context:** Building a field-facing app that captures inventory / SOP-task / maintenance-task data on-site (QR scan, photos, sensor checks), lets the operator decide whether to push the structured result to WhatsApp or to our own backend, and connects into the central Office Operations intelligence engine.

**Target users:** Low-literacy operators (housekeeping, maintenance, stockroom staff). Low-end Android devices (≤2 GB RAM, Android 8–11, intermittent 3G/4G).

---

# first read the research on inventory Management [Research_on_Inventory_Management.md](./Research_on_Inventory_Management.md)

## 1. Hard requirements vs. what each platform can actually deliver

| Capability | PWA (browser) | TWA (PWA wrapped in Android shell) | React Native / Flutter (native) |
|---|---|---|---|
| Camera (photo) | ✅ `getUserMedia` / `<input capture>` | ✅ | ✅ full control (resolution, flash, focus) |
| QR / barcode scan | ⚠️ via `BarcodeDetector` — **missing on most low-end Androids and iOS Safari**; fallback is a JS lib like `zxing-wasm` which is ~1–3 MB and slow on cheap CPUs | Same as PWA | ✅ ML Kit native — fast, works offline, handles damaged codes |
| GPS / strict geofence | ✅ but the user can deny once and you can't re-prompt cleanly; no background location | ✅ slightly better | ✅ background + foreground, configurable accuracy, mock-location detection |
| Wi-Fi SSID / BSSID check | ❌ **not exposed to browsers** at all. You can only see "online/offline" | ❌ | ✅ can read SSID (with location permission), verify the operator is actually on the site's Wi-Fi |
| Bluetooth (beacons, BLE tags, printers) | ⚠️ Web Bluetooth — **Chrome Android only, not iOS, requires user gesture per device**, no background scan | ⚠️ same | ✅ full BLE stack, beacon ranging, background scan |
| Offline cache | ✅ Service Worker + IndexedDB | ✅ | ✅ SQLite / WatermelonDB / MMKV |
| Offline **queue with retries across reboots** | ⚠️ Background Sync API is Chromium-only and the OS can kill it | ⚠️ same | ✅ WorkManager (Android) guarantees delivery |
| Push notifications | ✅ Android / ❌ iOS Safari is flaky | ✅ Android | ✅ FCM, full reliability |
| App-icon install, no URL bar | ⚠️ "Add to home screen" — users get confused | ✅ looks like an app | ✅ |
| Install size | ~0 (loaded over network first time) | 3–5 MB shell + cache | 15–40 MB |
| First-load on 3G | 2–8 s painful | Same on first run, instant after | Instant (already installed) |
| Update path | Instant, no user action | Instant for web content | Play Store / sideload — users must accept |
| Locking the user into kiosk mode / single app | ❌ | ⚠️ partial | ✅ device-owner mode possible |
| Mock-GPS / rooted-device detection | ❌ | ❌ | ✅ |

**Reading the table:** the deal-breakers for a pure PWA are **Wi-Fi SSID verification, reliable BLE, mock-location detection, and guaranteed offline queue delivery**. Each one is explicitly in your requirements.

---

## 2. Recommendation

**Build a native Android app (one codebase via React Native or Flutter), distributed as an APK / private Play track. Treat iOS as out-of-scope for v1 — your user base is on cheap Android.**

Reasons, in priority order:

1. **Wi-Fi SSID check and BLE are non-negotiable** for your "is the operator actually on site" guard. Browsers cannot do this. Anything you build as a PWA will need a native companion anyway — at which point the PWA is dead weight.
2. **Offline queue with guaranteed delivery** matters more for low-literacy users than for power users. A power user will notice "my submission didn't sync" and retry; your users will not. WorkManager + a local SQLite outbox is the only reliable answer.
3. **QR scanning on a ₹6k Android phone** with `zxing-wasm` in a browser is genuinely bad — 1–3 seconds per scan, fails on glare or worn labels. ML Kit native scans in <200 ms and handles damaged codes. For a worker scanning 50 items a shift this is the difference between "works" and "abandoned."
4. **UI affordances for low-literacy users** — big tap targets, voice prompts, haptic feedback on success, locked orientation, no browser chrome stealing screen space, no accidental swipe-to-back closing the app. Native gives you all of this; PWAs leak browser behavior.
5. **Update discipline** — yes, the Play Store update path is slower than PWA, but you can use Play's in-app update API to force critical updates, and you avoid the class of bugs where a stale service worker serves a broken UI for days.

### When a PWA *would* be the right call (not your case)

- Users are office knowledge workers on modern phones.
- No SSID / BLE / background sync requirements.
- You want zero-install adoption.
- You're shipping a v0 prototype and want to test concept before committing.

If you want a 2-week prototype to validate the workflow with one site before building the real thing, a PWA is fine for that throwaway. Do not let the prototype become the product.

---

## 3. Proposed system structure

```
┌─────────────────────────────────────────────────────────────┐
│ Field Android App (RN or Flutter)                            │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Capture      │  │ Pre-flight   │  │ Routing decision │   │
│  │ • QR (ML Kit)│  │ • GPS fence  │  │ • To WhatsApp    │   │
│  │ • Photo      │  │ • SSID match │  │ • To backend     │   │
│  │ • Form       │  │ • BLE beacon │  │ • To both        │   │
│  │ • Voice note │  │ • Mock-loc?  │  │                  │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘   │
│         │                 │                   │             │
│         ▼                 ▼                   ▼             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Local SQLite outbox (WatermelonDB)                   │   │
│  │ • capture rows + photo blobs                         │   │
│  │ • status: draft / queued / sent / acked              │   │
│  └────────────────────────┬─────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ WorkManager sync worker (exponential backoff)        │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS (multipart for photos)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ Edge ingest service (single endpoint)                       │
│   POST /v1/capture                                          │
│   • validates schema                                        │
│   • stores photo in object storage, returns CDN URL         │
│   • emits event → intelligence engine                       │
│   • fan-out:                                                │
│       ├─ if route=whatsapp → WhatsApp Cloud API template    │
│       ├─ if route=backend  → Office Ops core                │
│       └─ always → audit log + intelligence engine           │
└─────────────────────────────────────────────────────────────┘
```

### Key design choices

**One ingest endpoint, server-side fan-out.** Do *not* let the phone call WhatsApp Cloud API directly. Reasons: WhatsApp tokens would leak onto devices, template approval is centralized, retries and rate-limits need a server. The phone tells the server "route this to WhatsApp" and the server does the WhatsApp call.

**The "route" choice is metadata, not two code paths.** The app sends the same JSON regardless; a `destinations: ["whatsapp", "backend"]` field tells the server where to fan out. This keeps the app dumb and the policy on the server, where you can change it without re-releasing the APK.

**Photos go to object storage, not embedded in JSON.** The app uploads the photo in the same multipart request, the server replaces it with a CDN URL before fan-out. WhatsApp templates support media; passing a URL is cheaper than re-uploading.

**Pre-flight checks run before submit, and their results are signed into the payload.** GPS lat/long, SSID hash, beacon ID, timestamp, device ID — these become tamper-evident evidence on the server side. Don't trust them blindly (a determined user can patch the APK) but log them for audit.

**Intelligence engine subscribes to the event stream, never polls the database.** The ingest service emits a `capture.created` event; the intelligence engine consumes it. This decouples the field app from intelligence-engine availability — if the engine is down, captures still land and get processed when it recovers.

---

## 4. UX considerations for low-literacy users

These are platform-independent but easier to enforce in native:

- **Icons + colors over text.** Green check, red cross, big camera icon. Where text is needed, use the local language and offer audio playback of the prompt.
- **Voice-prompt every screen.** Tap the screen title → it reads aloud. Cheap to add, transformative for adoption.
- **One action per screen.** Don't show a form with 8 fields. Scan QR → confirm item with photo of the label → enter quantity with +/- buttons → done.
- **Haptic + sound on success.** Workers stop trusting silent confirmations.
- **No "submit" word.** Use a big green checkmark button. Use "send" only after the action is irreversible.
- **Show queue state plainly.** A badge "3 waiting to send" on the home screen, not buried in settings. When it clears to 0, celebrate it visibly.
- **Kiosk / single-app lock option** for site-owned devices, so workers can't accidentally exit to a browser or get stuck in a notification.
- **Pre-fill from context.** If the operator scans a QR on a fire extinguisher, the app already knows it's a maintenance task and skips the "what kind of task" question.

---

## 5. Tech stack suggestion

| Layer | Choice | Why |
|---|---|---|
| App framework | **React Native** (or Flutter if the team prefers Dart) | Native modules for ML Kit, BLE, Wi-Fi; one codebase; large hiring pool |
| Local DB | **WatermelonDB** on SQLite | Reactive, scales to 10k+ rows on cheap phones, plays well with sync |
| Sync | **WorkManager** via a native module | Survives reboot, OS-managed backoff |
| QR/Barcode | **ML Kit** (`@react-native-ml-kit/barcode-scanning`) | Free, on-device, fast |
| Photos | `react-native-vision-camera` | Lower-level control than `expo-camera`; needed for compression tuning on cheap devices |
| Geofence | `react-native-geolocation-service` + server-side validation | Don't trust the phone alone |
| BLE | `react-native-ble-plx` | Mature, beacon support |
| Wi-Fi SSID | `react-native-wifi-reborn` | Reads SSID with location permission |
| Push | FCM via `@react-native-firebase/messaging` | Reliable, free |
| Auth | OIDC + short-lived JWT, refresh on Wi-Fi | Don't ship long-lived secrets to the device |
| Distribution | **Private Play track** (preferred) or signed APK + MDM | Auto-updates, rollback |
| Crash / telemetry | Sentry + a custom event for "capture sent" success rate | The metric that matters |

---

## 6. What I would **not** do

- **Don't build a PWA first "to learn" and plan to rewrite.** You will not rewrite. The PWA will accrete features and the day you need SSID checks you'll be stuck.
- **Don't let the phone hit WhatsApp Cloud API directly.** Token sprawl, no rate-limiting, no audit.
- **Don't write your own QR decoder.** ML Kit is free and better than anything you'll ship in a year.
- **Don't make the operator choose "WhatsApp or backend" on every submit.** Choose a sensible default per task type on the server, let them override only when needed.
- **Don't gate submission on connectivity.** Capture first, sync later. Always.
- **Don't try to make iOS work in v1** unless a real customer asks. Every cross-platform compromise is a tax on the 95% case.

---

## 7. Phased rollout

**Phase 1 (4–6 weeks):** Android app with QR scan + photo + form + offline outbox + one ingest endpoint + WhatsApp template fan-out. No BLE, no SSID check yet. Pilot at one site.

**Phase 2 (3–4 weeks):** Add GPS geofence, SSID check, signed pre-flight payloads, audit dashboard. Connect to intelligence engine event stream.

**Phase 3 (4 weeks):** BLE beacons for indoor location, voice prompts, kiosk mode for site-owned devices, in-app updates.

**Phase 4:** iOS if and only if customer demand justifies it.

---

## 8. Open questions to resolve before coding

1. **Who owns the device?** Site-owned (kiosk mode possible, you can pre-provision) vs. operator-owned (BYOD, harder UX, training cost). Changes the answer for distribution and security.
2. **WhatsApp account model.** One business number per site, or one central number with site identifier in the template? Affects template approval count and reply routing.
3. **What happens to a capture sent to WhatsApp — does anyone *act* on it, or is it informational?** If actionable, the WhatsApp reply needs to flow back into the intelligence engine, which means you need WhatsApp webhook handling on the server.
4. **Photo retention policy.** Cheap phones fill up fast. Local cache must auto-evict after server-ack.
5. **Language coverage.** Hindi + English minimum? Regional languages? Voice prompts must be pre-recorded per language.
6. **What's the failure UX when a pre-flight check fails?** ("You are not on site Wi-Fi" — can they override with a supervisor PIN? Or hard block?)

Answer these six before locking the spec.
