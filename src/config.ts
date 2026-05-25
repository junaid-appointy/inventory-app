export const config = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:8080',
  siteId: process.env.EXPO_PUBLIC_SITE_ID ?? 'site-dev',
  syncIntervalMs: 30_000,
  outboxBatchSize: 20,
};
