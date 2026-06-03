# Build & Distribute — field-app

How to build, size-optimize, distribute, and OTA-update the field app **without using the Play Store**. Sideload-only, internal warehouse distribution.

---

## TL;DR

- **Two builds coexist**: a 224MB dev-client for your own testing, and a ~22–30MB production AAB → split APK for staff.
- **OTA updates work for ~95% of changes** via EAS Update (free tier, no APK reinstall).
- New APK is only required when you touch native code, plugins, permissions, or bump the Expo SDK.

---

## Why a vanilla EAS APK is huge

The Play Store delivers small installs because it ships **split APKs** (per ABI, per density, per language) generated from an AAB. A single universal APK bundles everything for every device.

For our app the size bloat came from:

1. **`development` profile** — dev-client + debug symbols + unstripped `.so` files + Expo dev menu. Adds ~140MB over a release build.
2. **All 4 ABIs** (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`) — ~30MB of dead weight for arm64-only phones.
3. **No R8 / resource shrinking** — ~10MB of unused code and resources.
4. **All locales bundled** — minor, but adds up.

---

## Size targets (from our 224MB baseline)

| Step | Cumulative size | Savings |
| --- | --- | --- |
| Current dev-client APK | **224 MB** | — |
| Switch to `preview`/`production` (release build, stripped libs) | ~75–90 MB | −140 MB |
| Restrict ABIs to `arm64-v8a` only | ~45–55 MB | −30 MB |
| Enable R8 + resource shrinking | ~35–45 MB | −10 MB |
| Drop unused locales | ~32–42 MB | −3 MB |
| AAB → per-device split APK via `bundletool` | **~22–30 MB** | −10 MB |

The single biggest lever is `development` → `production` profile — that alone gets you ~65% off.

---

## What's configured

### `app.json`

- `runtimeVersion: { policy: "appVersion" }` — ties OTA compatibility to `expo.version`. Bump it only when shipping native changes.
- `updates.url` — EAS Update endpoint (uses our existing `projectId`).
- `expo-build-properties` plugin:
  - `enableProguardInReleaseBuilds: true` — code shrinking via R8.
  - `enableShrinkResources: true` — drops unused resources.
  - `buildArchs: ["arm64-v8a"]` — only build for 64-bit ARM (covers every modern phone).
  - `extraProguardRules` — keep rules for Hermes, Reanimated, Vision Camera so shrinking doesn't strip them.

### `eas.json` — three profiles, three channels

| Profile | Output | Channel | Use case |
| --- | --- | --- | --- |
| `development` | APK (dev-client) | `development` | Your phone. Loads JS from Metro. Ignores OTA. |
| `preview` | APK (release) | `preview` | Stakeholder demos. Sideloadable, ~35–45 MB. |
| `production` | AAB | `production` | Warehouse staff. Run through `bundletool` → ~22–30 MB. |

---

## Commands

```bash
# 1. Your dev build (one-time; then JS hot-reloads via Metro)
eas build --profile development --platform android

# 2. Stakeholder preview APK (release, sideloadable)
eas build --profile preview --platform android

# 3. Production build for warehouse staff (AAB)
eas build --profile production --platform android
```

### Converting the AAB to a sideloadable APK with `bundletool`

```bash
# Install once (Mac):
brew install bundletool

# Universal APK (one file, works on any device — simpler, larger):
bundletool build-apks \
  --bundle=field-app.aab \
  --output=field-app.apks \
  --mode=universal \
  --ks=<your-keystore> --ks-key-alias=<alias>

# Or per-device APK (smallest):
bundletool build-apks --bundle=field-app.aab --output=field-app.apks
bundletool install-apks --apks=field-app.apks   # installs to connected phone
```

EAS signs the AAB for you — the keystore lives on EAS servers. For `bundletool` to extract installable APKs from a signed AAB, you can either:

- Download the keystore via `eas credentials` and pass it to `bundletool`, **or**
- Use `--mode=universal` without signing flags (the resulting APK is still signed because the AAB was signed at build time).

---

## OTA updates (EAS Update)

EAS Update pushes new JS bundles + assets to installed apps on next launch. **No new APK install required.** Free tier: 1,000 monthly active updates — plenty for an internal warehouse app.

### What OTA *can* update

- All TypeScript/React code (screens, logic, styles)
- Images, fonts, JSON, anything in `assetBundlePatterns`
- ~95% of changes you'll typically make

### What OTA *cannot* update (requires new APK)

- `app.json` plugins or permissions
- New `react-native-*` native libraries
- Expo SDK version bump
- New-arch / Hermes flags
- Anything that changes the **runtime version**

### Publishing updates

```bash
# Production rollout to warehouse phones
eas update --branch production --message "Fix scanner crash on Galaxy A05"

# Preview-only rollout (your demo phones)
eas update --branch preview --message "Try new catalog picker layout"

# Roll back a bad update
eas update --branch production --republish
```

Staff phones pick up updates on next app launch (controlled by `checkAutomatically: "ON_LOAD"`).

### `runtimeVersion` policy

We use `{ policy: "appVersion" }`. This means:

- All builds with the same `expo.version` (e.g. `0.1.0`) share OTA updates.
- Bumping `expo.version` to `0.2.0` for a native change **cuts the OTA stream** — old phones stop receiving updates meant for the new runtime. That's the correct behavior.
- Between version bumps, OTA flows freely.

---

## Workflow cheatsheet

| Change | What to do |
| --- | --- |
| Tweak a screen, fix a JS bug, change copy | `eas update --branch production` — instant rollout |
| Add new asset (image/font) | `eas update --branch production` |
| Add `react-native-something`, change permissions, bump SDK | Bump `expo.version` → new `eas build --profile production` → redistribute APK |
| Hotfix a bad OTA | `eas update --branch production --republish` |

---

## First-time setup notes

- `eas login` once on your machine. EAS will prompt on the first build/update if you aren't logged in.
- EAS auto-creates the Update branches the first time you publish to each.
- The `projectId` in `app.json` already binds everything — no extra wiring needed.

---

## Distribution channels (no Play Store)

For sideloading the production APK to staff phones, pick whichever fits:

- **Direct sideload** — share the `.apks` install via USB or a shared drive. Simplest.
- **Firebase App Distribution** — free, gives a download link, tracks who installed.
- **Diawi / similar** — quick share via a URL, no account setup.
- **Self-hosted URL** — drop the APK on a static host; staff scan a QR to download.

Whichever you pick, staff need to enable "Install from unknown sources" once per device.

---

## Gotchas

- **Don't rebuild for JS changes** — use OTA. Only rebuild the APK when native code/plugins/permissions/SDK change.
- **Always bump `expo.version` before a native-change build.** Otherwise OTA updates intended for the new runtime can land on old phones and crash them.
- **`bundletool` needs the AAB's signing key** to produce installable APKs. If using `eas credentials` to pull it locally, treat the keystore as a secret — don't commit it.
- **Test camera, haptics, offline sync on a real device** before publishing OTA. The simulator lies.
- **Don't ship the `development` profile to staff** — it's 5× larger and bundles dev tooling.
