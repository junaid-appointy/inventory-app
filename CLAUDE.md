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

Talks to `office-ops-engine`'s **inventory plugin** under `/api/inventory/*`. Base URL lives in `src/config.ts` (`EXPO_PUBLIC_API_BASE_URL` env override). Default in dev is the engine's ngrok tunnel.

Auth reuses the visitor module's **guard PIN flow**: `POST /api/guard/login` with `{ guardName, pin }` returns a session token that the field-app sends on every request as `x-guard-token`. `src/auth/session.ts` persists it; `src/auth/AuthProvider.tsx` exposes `useAuth()` + a live `useCan()` for RBAC gating. Gate the navigator on `session !== null` — unauthenticated users get the `LoginScreen` and nothing else.

Write paths go through the **outbox** (`src/db/outbox.ts`): the screen enqueues, the local SQLite cache is updated optimistically, then `flushOnce()` syncs each row to its dispatch in `sync/api.ts`. Read screens (`Stock`, `Alerts`, `Orders`) prefer remote on focus and fall back to local cache when offline. Every read screen calls `flushOnce()` before fetching remote so its first response reflects any just-queued writes.

## Conventions

- Offline-first: every write goes to local SQLite first, then queues for sync. Don't block UI on network.
- New native dependencies → bump version in `package.json`, then **rebuild the dev-client APK via EAS cloud** (`npx eas build --profile development --platform android`). This project does **not** use local Android Studio builds — no Java 17, no `ANDROID_HOME`, no `npm run android`. Skip `npm run prebuild` too — EAS runs prebuild on its servers, doing it locally is redundant. Once EAS finishes, install the APK on the phone, then `npm run start:dev-client` to serve JS.
- React Navigation (native-stack) for routing — not file-based.
- `react-native-reanimated` v4 is in use; remember the `'worklet'` directive for UI-thread functions.
- Don't introduce web-only libraries — anything DOM-specific will break the bundle.
- **Icons: Lucide only.** Use `lucide-react-native` components (`X`, `ScanLine`, `Check`, `AlertTriangle`, `Bell`, `Package`, `Truck`, `HandCoins`, `RefreshCw`, `Settings`, `Zap`/`ZapOff`, `Keyboard`, `Plus`/`Minus`, etc.). Pass them to `IconButton.Icon`, `Chip.Icon`, `StatusPill.Icon`, or inline as `<Icon size={N} color={palette.X} strokeWidth={2.2} />`. **Do not** use Unicode glyphs (`✓`, `⚠`, `←`, `⌖`, …) or emoji as action icons — they render inconsistently across fonts and at small sizes. Emoji is fine in user content (Hindi strings, vendor names) but not in chrome.
- **Theme + i18n + RBAC are provider-driven**, not module-level globals. Read from `useTheme()`, `useT()`, `useAuth()`/`useCan()`. The static `palette` re-export from `src/design/tokens.ts` is a fallback that mirrors the default theme — don't rely on it in new code.
- **Modules live in `src/modules/<id>/`** and self-register their screens via the module registry. Adding a new operational area (attendance, maintenance, …) means a new module folder + one line in `src/modules/registry.ts`, not edits to the navigator.
- **Loading UX**: list screens use `Skeleton` for first paint, not blank space. Refresh-on-focus does *not* re-show skeletons — keep existing rows visible while the background fetch runs. For the LLM normalizer's debounce, show an inline `ActivityIndicator` + "Checking…" hint so the user knows something is happening.
- **Don't hide failures.** The outbox surfaces failed rows in the Sync queue with the server's error body; auth failures bubble up through `ApiError` and the Login screen shows the real reason from the response. Don't catch-and-swallow when wiring new endpoints.

## Things to verify on real device, not simulator

- Camera / vision-camera flows
- Haptics
- Offline → online sync transitions
- SQLite migrations across app updates
