/**
 * Runtime config. Override at start via `EXPO_PUBLIC_*` env vars (Metro
 * picks them up automatically). Defaults assume the Android emulator
 * talking to a backend on the host (`10.0.2.2`) on the engine's
 * `VISITOR_HTTP_PORT` (4112). On a physical device you must set
 * `EXPO_PUBLIC_API_BASE_URL` to your laptop's LAN IP or an ngrok URL.
 */
export const config = {
  apiBaseUrl:
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    'https://unyearning-olympia-unclimactic.ngrok-free.dev',
  siteId: process.env.EXPO_PUBLIC_SITE_ID ?? 'site-dev',
  // How often the background loop pushes queued writes (outbox flush).
  // Cheap when the outbox is empty — no read payloads are pulled on this
  // tick.
  syncIntervalMs: 30_000,
  // How often the background loop re-pulls read-side data (catalog +
  // orders). Deliberately slow to respect limited warehouse bandwidth;
  // screen-focus and reconnect still pull fresh data during active use.
  readPullIntervalMs: 300_000,
  outboxBatchSize: 20,
};
