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
  syncIntervalMs: 30_000,
  outboxBatchSize: 20,
};
