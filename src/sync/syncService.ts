import * as Network from 'expo-network';
import { config } from '../config';
import { OutboxKind } from '../db/outbox';
import { markFailed, markSending, markSent, nextBatch, pendingCount, recoverOrphanedSending } from '../db/outbox';
import { replaceCanonicalProducts, type CanonicalProduct } from '../db/catalog';
import { upsertOrdersFromRemote } from '../db/orders';
import { replaceStockFromRemote } from '../db/stock';
import { pruneLotsToBarcodes, replaceLotsLocal } from '../db/lots';
import { api } from './api';
import { getSession } from '../auth/session';
import { cache, type CacheKey } from './cacheStatus';
import { invalidateRefetchThrottle } from './refetch';

type Listener = (count: number, lastSyncAt: number | null) => void;

let timer: ReturnType<typeof setInterval> | null = null;
let readTimer: ReturnType<typeof setInterval> | null = null;
let running = false;
let retryQueued = false;
let _lastSyncAt: number | null = null;
const listeners = new Set<Listener>();

export function getLastSyncAt(): number | null {
  return _lastSyncAt;
}

export function onPendingChange(l: Listener): () => void {
  listeners.add(l);
  pendingCount().then((c) => l(c, _lastSyncAt)).catch(() => {});
  return () => listeners.delete(l);
}

async function notify() {
  const c = await pendingCount().catch(() => 0);
  listeners.forEach((l) => l(c, _lastSyncAt));
}

// Dispatch table for outbox kinds. Adding a new kind = one line here
// + a handler in api.send.*.
const DISPATCH: Record<OutboxKind, (payload: object) => Promise<unknown>> = {
  receipt: api.send.receipt,
  product_registration: api.send.product,
  issue: api.send.issue,
  dispense: api.send.issue, // same endpoint, renamed in-app
  reorder_request: api.send.reorderRequest,
  mismatch_flag: api.send.mismatchFlag,
  learn_barcode: api.send.learnBarcode,
  stock_correction: api.send.stockCorrection,
};

// Per-kind cache invalidation map. After a successful dispatch we
// refetch the listed caches so the local view reflects the server's
// truth instead of just the optimistic write — closes the lag where
// "I just dispensed, but the Stock list still shows the old count".
// Empty list = no read-side cache touched (e.g. learn_barcode is
// internal plumbing, no user-visible refresh needed).
const POST_WRITE_INVALIDATES: Record<OutboxKind, CacheKey[]> = {
  receipt: ['stock', 'orders'],
  product_registration: ['catalog'],
  issue: ['stock', 'alerts'],
  dispense: ['stock', 'alerts'],
  reorder_request: ['alerts'],
  mismatch_flag: ['orders'],
  learn_barcode: [],
  stock_correction: ['stock', 'alerts'],
};

/**
 * Pull the freshest read-side data for each touched cache. Called once
 * per flushOnce after the outbox batch settles. Each fetch runs in
 * parallel and updates its cache state independently so a stock pull
 * failing doesn't block an orders pull.
 */
async function invalidateAffectedCaches(keys: Set<CacheKey>): Promise<void> {
  const work: Promise<void>[] = [];
  for (const key of keys) {
    invalidateRefetchThrottle(key);
    work.push(refreshOne(key));
  }
  await Promise.allSettled(work);
}

async function refreshOne(key: CacheKey): Promise<void> {
  cache.refreshing(key);
  try {
    if (key === 'stock' || key === 'alerts') {
      const remote = await api.fetch.stock();
      await replaceStockFromRemote(
        remote.map((r) => ({
          barcode: r.barcode,
          name: r.name,
          category: r.category,
          unit: r.unit,
          pack_size: r.pack_size != null ? Number(r.pack_size) : null,
          dispense_mode: r.dispense_mode ?? 'pack',
          on_hand: Number(r.on_hand),
          threshold: Number(r.threshold),
        })),
      );
      // Mirror per-barcode lots locally too. Empty array clears the
      // local lots for that barcode (matches server having no batches).
      for (const r of remote) {
        await replaceLotsLocal(
          r.barcode,
          (r.lots ?? []).map((l) => ({
            expiry_date: l.expiry_date,
            qty: Number(l.qty),
          })),
        );
      }
      await pruneLotsToBarcodes(remote.map((r) => r.barcode));
    } else if (key === 'orders') {
      await syncOrders();
    } else if (key === 'catalog') {
      await syncCanonicalProducts();
    }
    cache.warm(key);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('Network request failed') ||
      msg.includes('TypeError: Network') ||
      msg.includes('Unable to resolve host')
    ) {
      cache.offline(key);
    } else {
      cache.error(key);
    }
  }
}

/**
 * Push the outbox and (optionally) pull read-side data.
 *
 * `pullReads` controls the trailing catalog + orders GETs. Default true so
 * focus-refetch, reconnect, and manual "Sync now" keep data fresh during
 * active use. The frequent background timer passes `false` so idle ticks
 * only push queued writes (≈free when the outbox is empty) instead of
 * re-downloading the full catalog every 30s — read pulls run on the slower
 * `readPullIntervalMs` cadence instead. Post-write cache invalidation
 * (driven by what actually committed) always runs regardless.
 */
export async function flushOnce(opts?: { pullReads?: boolean }): Promise<{ sent: number; failed: number }> {
  const pullReads = opts?.pullReads ?? true;
  if (running) {
    // Queue a retry so manual "Sync Now" taps aren't silently dropped.
    retryQueued = true;
    return { sent: 0, failed: 0 };
  }
  running = true;
  let sent = 0;
  let failed = 0;
  try {
    const net = await Network.getNetworkStateAsync().catch(() => ({ isConnected: false }));
    if (!net.isConnected) return { sent, failed };

    // Recover anything orphaned by a prior crash/kill before picking
    // the batch — otherwise the stuck row will be skipped again.
    await recoverOrphanedSending().catch(() => 0);

    // Track which read-side caches got touched by this batch so we can
    // refresh them once, after the loop. Refetching per-row would
    // multiply network calls on a delivery scan (50 receipts → 50 stock
    // pulls); coalescing here means at most one pull per cache per batch.
    const touched = new Set<CacheKey>();

    const batch = await nextBatch(config.outboxBatchSize);
    for (const row of batch) {
      const dispatch = DISPATCH[row.kind];
      if (!dispatch) {
        await markFailed(row.id, `Unknown kind: ${row.kind}`);
        failed++;
        continue;
      }
      try {
        await markSending(row.id);
        await dispatch(JSON.parse(row.payload));
        await markSent(row.id);
        sent++;
        for (const k of POST_WRITE_INVALIDATES[row.kind]) touched.add(k);
      } catch (err) {
        await markFailed(row.id, err instanceof Error ? err.message : String(err));
        failed++;
      }
    }
    if (sent > 0 || failed > 0) {
      _lastSyncAt = Date.now();
    }

    // Post-write cache refresh — runs only when at least one write
    // committed AND we're still logged in. Bypasses the throttle so the
    // user sees their write reflected immediately, without waiting for
    // the next periodic timer tick.
    if (touched.size > 0 && getSession()?.token) {
      await invalidateAffectedCaches(touched);
    }

    // Skip pulls when not logged in — they'd 401 and only add log noise.
    // Login screen / AuthProvider will trigger a flush after a successful
    // login. Gated on pullReads so idle background ticks don't re-download
    // the catalog every cycle (bandwidth/cost constraint).
    if (pullReads && getSession()?.token) {
      // Pull latest canonical products catalog so guards always have the
      // latest admin-curated product names.
      await syncCanonicalProducts().catch(() => {});
      // Also mirror the open-orders list so ReceivingScreen can resolve
      // catalog picks to the right order item without a round-trip.
      await syncOrders().catch(() => {});
    }
  } finally {
    running = false;
    await notify();
  }

  // If someone tapped "Sync Now" while we were busy, run again.
  if (retryQueued) {
    retryQueued = false;
    return flushOnce();
  }

  return { sent, failed };
}

/**
 * Pull the canonical product catalog from the backend and replace
 * the local SQLite cache. Guards pick from this list — keeping it
 * fresh is essential for the catalog-only gate flow.
 *
 * Returns the counts so the picker UI can surface "X of Y synced" and
 * the user can detect cache mismatches without having to dig into logs.
 */
let _lastCatalogSync: { remote: number; written: number; failed: number; error: string | null } = {
  remote: 0, written: 0, failed: 0, error: null,
};
export function getLastCatalogSync() { return _lastCatalogSync; }

export async function syncCanonicalProducts(): Promise<{ remote: number; written: number; failed: number }> {
  try {
    const remote = await api.fetch.canonicalProducts();
    const local: CanonicalProduct[] = remote.map((r) => ({
      product_id: r.product_id,
      canonical_name: r.canonical_name,
      category: r.category,
      hsn_code: r.hsn_code,
      unit: r.unit,
      pack_size: r.pack_size,
      dispense_mode: r.dispense_mode ?? 'pack',
      has_barcode: r.has_barcode ? 1 : 0,
      primary_barcode: r.primary_barcode ?? null,
      updated_at: Date.now(),
    }));
    const result = await replaceCanonicalProducts(local);
    _lastCatalogSync = {
      remote: remote.length,
      written: result.ok,
      failed: result.failed,
      error: result.firstError ?? null,
    };
    if (result.failed > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[catalog] sync wrote ${result.ok}/${remote.length}; ${result.failed} failed. First error: ${result.firstError}`);
    }
    return { remote: remote.length, written: result.ok, failed: result.failed };
  } catch (err) {
    _lastCatalogSync = {
      ..._lastCatalogSync,
      error: err instanceof Error ? err.message : String(err),
    };
    // eslint-disable-next-line no-console
    console.warn('[catalog] sync failed:', err);
    return { remote: 0, written: 0, failed: 0 };
  }
}

/**
 * Pull the current open-orders list from the backend and mirror it into
 * the local orders/order_items tables. Lets ReceivingScreen resolve a
 * catalog pick to the right order item locally.
 */
export async function syncOrders(): Promise<void> {
  try {
    const remote = await api.fetch.orders();
    await upsertOrdersFromRemote(remote);
  } catch {
    // Non-fatal: ReceivingScreen falls back to "no matching order".
  }
}

let netSub: { remove: () => void } | null = null;
let wasOnline = true;

export function startSync(): void {
  if (timer) return;
  // Recover anything left mid-flight by a previous process before the
  // first flush, otherwise nextBatch skips them and they stay stuck on
  // "Sending…" forever.
  recoverOrphanedSending()
    .then((n) => {
      if (n > 0) {
        // eslint-disable-next-line no-console
        console.log(`[sync] recovered ${n} orphaned 'sending' row${n === 1 ? '' : 's'}`);
      }
    })
    .catch(() => {})
    .finally(() => {
      // Push queued writes on start. Read-data warming at launch/login is
      // owned by warmCache() (called from AuthProvider), so this initial
      // flush is push-only — avoids a duplicate catalog/orders pull right
      // after warmCache already did one.
      flushOnce({ pullReads: false }).catch(() => {});
    });
  // Frequent tick: push queued writes only. Cheap when the outbox is
  // empty — no read payloads downloaded.
  timer = setInterval(() => {
    flushOnce({ pullReads: false }).catch(() => {});
  }, config.syncIntervalMs);
  // Slow tick: re-pull read-side data (catalog + orders) on a relaxed
  // cadence so idle devices don't keep re-downloading the catalog.
  readTimer = setInterval(() => {
    flushOnce({ pullReads: true }).catch(() => {});
  }, config.readPullIntervalMs);

  // Trigger a flush the moment connectivity returns, instead of waiting
  // up to syncIntervalMs for the next timer tick. This makes "I just
  // walked out from a dead zone" reliably catch up in ~1s.
  try {
    netSub = Network.addNetworkStateListener((state) => {
      const online = !!state.isConnected;
      if (online && !wasOnline) {
        // eslint-disable-next-line no-console
        console.log('[sync] connectivity returned — triggering flush');
        flushOnce().catch(() => {});
      }
      wasOnline = online;
    });
  } catch {
    // Listener API not available on this platform / SDK version; the
    // periodic timer still picks things up.
  }
}

export function stopSync(): void {
  if (timer) clearInterval(timer);
  timer = null;
  if (readTimer) clearInterval(readTimer);
  readTimer = null;
  if (netSub) {
    try { netSub.remove(); } catch { /* ignore */ }
    netSub = null;
  }
}
