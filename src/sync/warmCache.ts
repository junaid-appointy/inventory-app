/**
 * Post-login cache warm-up.
 *
 * Fires every read-side fetch in parallel so the user lands on Home
 * with skeletons that fill in as each request returns. Non-blocking by
 * design — the caller (AuthProvider.login / App rehydrate) does NOT
 * await this.
 *
 * Each cache transitions independently:
 *   cold → refreshing → (warm | error | offline)
 *
 * One failed cache does not block the others. 401 is handled centrally
 * in sync/api.ts (clears the session and the AuthProvider unmounts the
 * navigator), so we don't see that path here.
 */

import { cache, type CacheKey } from './cacheStatus';
import { pullStockIntoCache } from './stockPull';
import { syncCanonicalProducts, syncOrders } from './syncService';
import { getSession } from '../auth/session';

/** Heuristic: distinguish "no network" from "server said no" so the UI
 *  can show an offline banner vs. a retry banner. The exact fetch error
 *  text differs across RN/Hermes/iOS/Android; match the common shapes. */
function isOfflineError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Network request failed') ||
    msg.includes('TypeError: Network') ||
    msg.includes('Unable to resolve host')
  );
}

async function warmOne(key: CacheKey, fn: () => Promise<void>): Promise<void> {
  cache.refreshing(key);
  try {
    await fn();
    cache.warm(key);
  } catch (err) {
    if (isOfflineError(err)) {
      cache.offline(key);
    } else {
      cache.error(key);
    }
  }
}

async function warmStock(): Promise<void> {
  await pullStockIntoCache();
}

/**
 * Run all four warm-up fetches in parallel. Safe to call multiple times;
 * the per-cache state transitions are idempotent. No-op if no session.
 */
export async function warmCache(): Promise<void> {
  if (!getSession()?.token) return;
  await Promise.allSettled([
    warmOne('catalog', async () => { await syncCanonicalProducts(); }),
    warmOne('orders', async () => { await syncOrders(); }),
    warmOne('stock', warmStock),
    // Alerts is computed from the stock cache (listLowOrOut reads
    // stock_levels). Treat alerts state as a mirror of stock so the
    // Home alerts tile follows the same skeleton timeline.
    warmOne('alerts', async () => { /* no-op; mirrors stock */ }),
  ]);
}
