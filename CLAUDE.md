# field-app

The **warehouse / floor mobile app** for inventory and asset operations. Android-first, distributed internally via EAS. Built for staff on low-to-mid-end phones with patchy Wi-Fi — offline-first by design.

> Root context: see `../CLAUDE.md` for the product vision and the four constraints (cost, literacy, device capability, infrastructure) that govern all design decisions.
> Long-form dev setup (toolchain, EAS, Android Studio): see `DEVELOPMENT.md` in this folder.

## What this app does

- On-the-floor inventory and asset scanning (barcode / QR via `react-native-vision-camera`)
- Offline-first: local SQLite (`expo-sqlite`), syncs with backend when network returns
- Haptics + camera + network-aware UX (`expo-haptics`, `expo-network`)
- Designed for warehouse/staff phones, not for office admins (that's `ops-dashboard`) or visitors (that's `visitor-web`)

Stack: **Expo SDK 54 + React Native 0.81 + React 19 + TypeScript + React Navigation + expo-sqlite + vision-camera**. Pinned to **Node 22 LTS** (Node 24 breaks Expo's config-plugin loader).

## Why native and not PWA?

The `visitor-web` PWA works because it lives on a fixed tablet on Wi-Fi. The field app needs:

- Reliable offline operation (warehouse Wi-Fi is patchy)
- Native barcode scanning performance
- Hardware-level camera focus control
- Background sync when network returns

PWAs cannot do these well enough. See `../PWA_vs_Native_Decision.md` at repo root.

## Commands

```bash
# Day-to-day JS/TS changes (Metro hot-reloads in <1s)
npm start                  # Expo dev server, expects an installed dev-client APK on the device

# Rebuild dev-client (only when native code / plugins / native libs change)
npm run start:dev-client   # Dev server pointed at dev-client builds
npm run android            # Local rebuild via Android Studio (requires Java 17, ANDROID_HOME)
npm run prebuild           # Regenerate native /android folder from app.json

npm run lint               # tsc --noEmit (type-check only; no ESLint configured)
```

**The 95% rule:** almost every change is JS/TS — Metro reloads it onto the phone instantly. Only rebuild the dev-client APK when you touch `app.json` plugins, new `react-native-*` libraries, Android permissions, or new-arch flags. See `DEVELOPMENT.md` §"Two rebuild paths" for the local-vs-EAS decision.

## Distribution

EAS internal builds (no Play Store). Config: `eas.json`. Build profiles: dev-client (for development), internal (for stakeholders).

```bash
eas build --profile development --platform android
eas build --profile preview --platform android
```

## How it connects to the backend

Talks to `office-ops-engine` via HTTP. API base URL is configured in app config / env (check `src/` for the constant — do not hardcode in components).

## Conventions

- Offline-first: every write goes to local SQLite first, then queues for sync. Don't block UI on network.
- New native dependencies → bump version in `package.json`, run `npm run prebuild`, then rebuild dev-client.
- React Navigation (native-stack) for routing — not file-based.
- `react-native-reanimated` v4 is in use; remember the `'worklet'` directive for UI-thread functions.
- Don't introduce web-only libraries — anything DOM-specific will break the bundle.

## Things to verify on real device, not simulator

- Camera / vision-camera flows
- Haptics
- Offline → online sync transitions
- SQLite migrations across app updates
