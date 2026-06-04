# AGENTS.md

Instructions for any AI coding agent (Codex, Claude Code, Cursor, etc.) working in `field-app`.

> **Read `CLAUDE.md` in this folder first.** It is the canonical source for what this app is, the architecture, the conventions, and the offline-first rules. This file repeats the must-knows and adds the universal quality bar.
> For dev environment setup (Node, Java, Android Studio, EAS), see `DEVELOPMENT.md`.

## What this repo is

The warehouse / floor mobile app for inventory and asset operations. Expo / React Native, Android-first, distributed via EAS internal builds. Designed for low-to-mid-end staff phones on patchy Wi-Fi — every write is offline-first.

In the long run this app is the umbrella **office-operations super-app**: inventory today, then visitor management, daily tasks, maintenance proofs, complaints, and more — each as a self-registering module under `src/modules/<id>/`. Keep that boundary clean.

Stack: Expo SDK 54 + React Native 0.81 + React 19 + TypeScript + React Navigation + expo-sqlite + vision-camera. **Pinned to Node 22 LTS** — Node 24 breaks Expo's config-plugin loader.

## Commands

```bash
npm start                  # Metro for the installed dev-client APK (95% of work)
npm run start:dev-client   # Metro targeting dev-client builds
npm run android            # Local rebuild via Android Studio (rare — see CLAUDE.md)
npm run prebuild           # Regenerate /android from app.json
npm run lint               # tsc --noEmit (no ESLint configured)
```

**The 95% rule:** almost every change is JS/TS and Metro hot-reloads it in <1s. Only rebuild the dev-client APK (via EAS cloud, not local) when `app.json` plugins, native libraries, Android permissions, or new-arch flags change. See `CLAUDE.md` and `DEVELOPMENT.md` for the rebuild paths.

## Quality bar — non-negotiable

Apply on every change, no exceptions:

1. **`npm run lint` (tsc --noEmit) is clean.** No TS errors, no syntax errors, no failed imports.
2. **App builds and starts.** If you touched native config (`app.json`, native deps, permissions), an EAS dev-client rebuild is required before claiming done — say so if you couldn't run it.
3. **No `any` shortcuts**, no `// @ts-ignore`, no silently swallowed errors. Fix the type, don't suppress it.
4. **Match existing patterns.** Read 2–3 nearby files before writing a new screen, module, or sync path. Reuse `ApiError`, the outbox helpers, `useAuth()` / `useCan()`, `useTheme()`, `useT()`.
5. **Don't introduce abstractions speculatively.** Modules in `src/modules/<id>/` exist so you can add an operational area without touching the navigator — use that, don't reinvent it.
6. **Dependencies cost bundle weight, OTA size, and dev-client rebuilds.** A new native dep means a forced EAS build for every team member — justify it.
7. **Don't catch-and-swallow.** The outbox surfaces failures in the Sync queue with the server's error body; `ApiError` carries it through. Don't hide it.
8. **No web-only libraries** — anything DOM-specific (`document`, `window`, browser-only React libs) breaks the bundle.
9. **Lucide icons only.** No Unicode glyphs (`✓`, `⚠`, `←`, …) or emoji as action icons — they render inconsistently across fonts. See `CLAUDE.md` for the icon set.
10. **No commit / push / deploy unless the user explicitly asks.**
11. **Never commit secrets** — `.env`, `eas-secrets`, service-account JSONs.

## Repo-specific must-knows

- **Offline-first is non-negotiable.** Every write goes to SQLite first, then queues for sync. Don't block UI on the network.
- **Provider-driven theme, i18n, RBAC.** Read from `useTheme()`, `useT()`, `useAuth()` / `useCan()`. The static `palette` re-export in `src/design/tokens.ts` is a fallback for legacy code — don't rely on it in new code.
- **Modules self-register.** Add a new operational area as `src/modules/<id>/` plus one line in `src/modules/registry.ts`. Don't edit the navigator directly.
- **Loading UX**: list screens use `Skeleton` for first paint, not blank space. Refresh-on-focus keeps existing rows visible while the background fetch runs — don't re-show skeletons.
- **Reanimated v4 worklets.** Remember the `'worklet'` directive on UI-thread functions.
- **Verify on a real Android device** for camera / vision-camera, haptics, offline→online sync, and SQLite migrations across app updates. The simulator lies about all four.

## Backend boundary

Talks to `office-ops-engine` under `/api/inventory/*` (and reuses the visitor module's guard-PIN flow at `/api/guard/login` for auth). Base URL from `EXPO_PUBLIC_API_BASE_URL` in `src/config.ts`. Hand-redefine types locally — no shared types package.

## When unsure, ask

This app touches hardware (camera, haptics), local persistence (SQLite migrations), and an offline outbox. If a change risks data loss, schema drift, or background-sync correctness, prefer to confirm intent with the user before writing code.
