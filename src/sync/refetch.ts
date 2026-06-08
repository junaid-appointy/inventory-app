/**
 * Stale-while-revalidate background refetch.
 *
 * Replaces the old `isCacheStale` gate (TTL-based "skip if fresh enough")
 * with an "always refetch on focus, throttled to avoid back-to-back
 * hammering" model.
 *
 * Two protections:
 *   1. **Throttle** — if a fetch for this key fired in the last
 *      `THROTTLE_MS`, skip silently. Stops a navigation burst from
 *      firing N parallel requests when the user taps Stock → back → Stock
 *      quickly.
 *   2. **Inflight dedupe** — if a fetch is already in flight, return the
 *      same promise instead of starting another. Two screens (Home and
 *      Stock) waking up simultaneously each only get one network call
 *      between them.
 *
 * State transitions are driven through `cache.*` so every screen that
 * subscribes via `useCacheStatus` sees the change.
 */

import { cache, type CacheKey } from './cacheStatus';

const THROTTLE_MS = 2000;

const lastFetchAt = new Map<CacheKey, number>();
const inflight = new Map<CacheKey, Promise<void>>();

/** Same heuristic as warmCache.ts — keep them in sync if you tweak it. */
function isOfflineError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Network request failed') ||
    msg.includes('TypeError: Network') ||
    msg.includes('Unable to resolve host')
  );
}

/**
 * Run `fn` to refetch this key. Returns the in-flight promise if one is
 * already running; resolves immediately (no-op) if throttled.
 *
 * Always-fetch-on-focus callers can `await` this safely — by the time
 * it resolves either (a) a fresh fetch completed and the cache is warm,
 * (b) we deduped onto an in-flight fetch and that resolved, or (c) the
 * throttle skipped because a fetch fired <THROTTLE_MS ago.
 */
export async function refetchThrottled(
  key: CacheKey,
  fn: () => Promise<void>,
): Promise<void> {
  const existing = inflight.get(key);
  if (existing) return existing;

  const last = lastFetchAt.get(key) ?? 0;
  if (Date.now() - last < THROTTLE_MS) return;

  cache.refreshing(key);
  const p = (async () => {
    try {
      await fn();
      cache.warm(key);
    } catch (err) {
      // 401 is handled centrally in sync/api.ts (it clears the session;
      // we'll get unmounted before this state matters).
      if (isOfflineError(err)) cache.offline(key);
      else cache.error(key);
    } finally {
      lastFetchAt.set(key, Date.now());
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/**
 * Force the next refetch to bypass the throttle. Used by pull-to-refresh
 * and post-write invalidation so a user-initiated refresh is never
 * dropped silently.
 */
export function invalidateRefetchThrottle(key: CacheKey): void {
  lastFetchAt.set(key, 0);
}

/** Clear all throttles. Logout / 401 auto-clear — keeps no residue from
 *  the previous session. */
export function resetAllRefetchThrottles(): void {
  lastFetchAt.clear();
  // Don't clear `inflight` — in-flight promises will still resolve and
  // clean themselves up via the finally{} above.
}
