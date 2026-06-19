# REPO_GUIDE — field-app

> **What this file is:** a self-contained map of *what this repository actually is and how the code works*, for an AI agent (or new engineer) with **no access to any parent/umbrella docs**. Descriptive, not prescriptive — for behavioral rules see `CLAUDE.md`/`AGENTS.md`; for toolchain/EAS setup see `DEVELOPMENT.md`.
>
> **Source of truth is the code.** Written by reading the source on **2026-06-16**. If this disagrees with the code, the code wins. Correct this file when you notice drift.

---

## 1. What this repo is

`field-app` is the **warehouse / floor mobile app** for inventory (and future asset) operations — used by staff on **low-to-mid-end Android phones with patchy Wi-Fi**, so it is **offline-first by design**. Android-first, distributed internally via **EAS** (no Play Store). It is *not* for office admins (that's `ops-dashboard`) or visitors (that's `visitor-web`).

Core jobs: barcode/QR scanning on the floor, receiving stock, dispensing/issuing, managing orders, registering products, viewing stock/alerts/expiry, all working offline and syncing to the backend when the network returns.

## 2. Stack

- **Expo SDK 54 + React Native 0.81 + React 19 + TypeScript.** Pinned to **Node 22 LTS** (Node 24 breaks Expo's config-plugin loader).
- **Navigation:** React Navigation **native-stack** (`@react-navigation/native-stack`) — code-based, *not* expo-router/file-based. There is **no `app/` directory**.
- **Local DB:** `expo-sqlite` (`fieldapp.db`, WAL mode) — the offline source of truth.
- **Camera/scan:** `react-native-vision-camera`. **Haptics:** `expo-haptics`. **Network awareness:** `expo-network`. **Animations:** `react-native-reanimated` v4 (remember the `'worklet'` directive).
- **Fuzzy matching:** `fuse.js` (product name matching). **IDs:** `nanoid`.
- **Icons:** `lucide-react-native` only (no Unicode glyphs/emoji in chrome).
- Entry: `index.ts` → `App.tsx` (via `registerRootComponent`).

## 3. App bootstrap (`App.tsx`)

Provider tree: `ThemeProvider → I18nProvider → AuthProvider → AppShell`. On mount, `AppShell`:
1. opens/migrates the SQLite DB (`getDb()`),
2. runs a one-time local-cache reset (`resetLocalCacheOnce`),
3. starts the background sync loop (`startSync()`),
then renders `RootNavigator` inside `GestureHandlerRootView` + `SafeAreaProvider`. Startup errors and the not-ready state render dedicated screens (no blank flashes).

## 4. Directory map (`src/`)

| Path | Role |
|---|---|
| `config.ts` | Runtime config: `apiBaseUrl` (`EXPO_PUBLIC_API_BASE_URL`), `siteId`, **`syncIntervalMs: 30_000`** (outbox flush), **`readPullIntervalMs: 300_000`** (read pull), `outboxBatchSize`. |
| `auth/` | `AuthProvider.tsx` (`useAuth()`, live `useCan()`), `session.ts` (persists guard token). |
| `rbac/` | `permissions.ts` + index — RBAC permission catalog used by `useCan()`. |
| `db/` | SQLite layer. `database.ts` (open/migrate, `SCHEMA_VERSION`), `outbox.ts` (write queue), and per-domain modules: `catalog`, `products`, `stock`, `lots`, `orders`, `maintenance`, `expiry`, plus `maintenance.ts` (cache reset). |
| `sync/` | `syncService.ts` (background loop + outbox dispatch table), `api.ts` (HTTP + `api.send.*` dispatchers), `networkState.ts`, `cacheStatus.ts`, `refetch.ts`, `warmCache.ts`. |
| `navigation/` | `RootNavigator.tsx` (native-stack; gated on auth) + `types.ts`. |
| `modules/` | Pluggable feature modules. `registry.ts` lists installed modules (currently **only `inventory`**); `types.ts` defines the `Module` contract; `index.ts`. |
| `modules/inventory/` | The one live module: `screens/` (Home, Stock, Receiving, Dispense, Orders, OrderSession, Scanner, CatalogPicker, RegisterProduct, EditStock, Alerts, Outbox, DeliverySummary, Settings, Login), `components/` (BatchEditor, LotPicker, DatePickerModal, FilterDropdown, QueueBadge, SyncRefreshButton, OrderSessionContext), `hooks/` (nameMatch, useCanonicalSuggest, useCatalogSuggest). |
| `design/` | **Our own thin component library over `tokens.ts`** (Material-3 token values, *not* a framework): `Button`, `Card`, `Chip`, `Text`, `TextField`, `AppBar`, `IconButton`, `ListItem`, `QtyStepper`, `CompactStepper`, `StatusPill`, `Surface`, `Skeleton`. |
| `theme/` | `ThemeProvider.tsx`, `themes.ts`, `types.ts` — `useTheme()` returns the active `palette`. |
| `i18n/` | `I18nProvider.tsx`, `strings.ts`, index — `useT()` for translatable chrome (English/Hindi); stored values stay canonical English. |
| `components/` | Cross-module shared, e.g. `OfflineBanner.tsx`. |
| `utils/`, `hooks/` | `device`, `expiry`, `haptics`; `useKeyboardHeight`. |

## 5. The module system

Operational areas are **modules** under `src/modules/<id>/`. Each module self-registers its screens; `RootNavigator` renders screens from the registry, so **adding a new area (attendance, maintenance, …) is a new module folder + one line in `src/modules/registry.ts`**, not edits to the navigator. Home filters available modules/screens by RBAC. Today only `inventoryModule` is installed.

## 6. Offline-first data flow (the heart of the app)

**Writes** go through the **outbox** (`db/outbox.ts`):
1. A screen enqueues a write *and* optimistically updates local SQLite.
2. `syncService.flushOnce()` pulls the next batch and dispatches each row by its `OutboxKind` through a **dispatch table** to `sync/api.ts` (`receipt`, `product_registration`, `issue`, `dispense` (→ same issue endpoint), `reorder_request`, …). Rows are marked sending/sent/failed; **failed rows surface in the Outbox/Sync queue with the server's error body** — don't catch-and-swallow.

**Reads** (Stock, Alerts, Orders): prefer remote on focus, fall back to local cache when offline. **Every read screen calls `flushOnce()` before fetching remote**, so its first response reflects any just-queued writes.

**Background sync cadence is deliberately split for cost/bandwidth** (`config.ts`):
- **30s** outbox flush — cheap when empty (no read payloads pulled).
- **5min** read pull (catalog + orders + stock + lots) — slow on purpose for limited warehouse bandwidth; screen-focus and reconnect still pull fresh data during active use.
Don't collapse these into one aggressive poll.

**SQLite migrations:** bump `SCHEMA_VERSION` in `db/database.ts` and add a migration block in `runMigrations()` for additive changes. `getDb()` caches the in-flight open *promise* (not just the handle) to avoid concurrent-open races at launch.

## 7. Backend connection & auth

- Talks to `office-ops-engine`'s **inventory plugin** at `/api/inventory/*`. Base URL from `src/config.ts` (`EXPO_PUBLIC_API_BASE_URL`; default is the engine's ngrok tunnel; emulator default would be `10.0.2.2:4112`).
- **Auth reuses the visitor module's guard PIN flow:** `POST /api/guard/login` with `{ guardName, pin }` → session token, sent on every request as `x-guard-token`. `auth/session.ts` persists it; the navigator is gated on `session !== null` (unauthenticated → `LoginScreen` only).

## 8. Commands

```bash
npm start                 # Expo dev server (expects an installed dev-client APK on the device)
npm run start:dev-client  # Dev server pointed at dev-client builds
npm run lint              # tsc --noEmit (type-check only; no ESLint configured)
```

**The 95% rule:** almost every change is JS/TS and Metro hot-reloads it instantly. Only rebuild the dev-client APK when you touch `app.json` plugins, add `react-native-*` native libs, change Android permissions, or new-arch flags.

## 9. Build & distribution (EAS)

Internal EAS builds, no Play Store. Config in `eas.json` (profiles: `development` for dev-client, `preview`/`internal` for stakeholders).

```bash
eas build --profile development --platform android   # rebuild dev-client APK (native changes)
eas build --profile preview --platform android       # stakeholder build
```

> Per project convention, native rebuilds go through **EAS cloud**, not local Android Studio — skip `npm run prebuild`/`npm run android`. See `DEVELOPMENT.md`.

## 10. Conventions worth knowing before editing

- **Offline-first:** every write hits local SQLite first, then queues. Never block UI on network.
- **Provider-driven theme/i18n/RBAC:** read from `useTheme()`, `useT()`, `useAuth()`/`useCan()` — not module globals. The static `palette` re-export in `design/tokens.ts` is only a default-theme fallback.
- **Material-3 tokens, our own components:** use the `src/design/` wrappers over `tokens.ts`; do not add MUI/paper/Tailwind or any heavy UI framework.
- **Icons Lucide-only** via `lucide-react-native`; no Unicode glyphs/emoji in chrome (emoji OK in user content).
- **Loading UX:** Skeletons for first paint; refresh-on-focus keeps existing rows visible (no re-skeleton); show inline "Checking…" + `ActivityIndicator` for debounced async (e.g. the LLM name normalizer).
- **No web-only/DOM libraries** — they break the RN bundle.
- **Verify on a real device, not the simulator:** camera/vision-camera, haptics, offline→online sync transitions, SQLite migrations across app updates.
