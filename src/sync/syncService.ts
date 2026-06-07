import * as Network from 'expo-network';
import { config } from '../config';
import { OutboxKind } from '../db/outbox';
import { markFailed, markSending, markSent, nextBatch, pendingCount, recoverOrphanedSending } from '../db/outbox';
import { replaceCanonicalProducts, type CanonicalProduct } from '../db/catalog';
import { upsertOrdersFromRemote } from '../db/orders';
import { api } from './api';
import { getSession } from '../auth/session';

type Listener = (count: number, lastSyncAt: number | null) => void;

let timer: ReturnType<typeof setInterval> | null = null;
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
};

export async function flushOnce(): Promise<{ sent: number; failed: number }> {
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
      } catch (err) {
        await markFailed(row.id, err instanceof Error ? err.message : String(err));
        failed++;
      }
    }
    if (sent > 0 || failed > 0) {
      _lastSyncAt = Date.now();
    }

    // Skip pulls when not logged in — they'd 401 and only add log noise.
    // Login screen / AuthProvider will trigger a flush after a successful login.
    if (getSession()?.token) {
      // Pull latest canonical products catalog on each sync cycle.
      // This is lightweight (just a GET) and ensures guards always
      // have the latest admin-curated product names.
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
      has_barcode: r.has_barcode ? 1 : 0,
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
      flushOnce().catch(() => {});
    });
  timer = setInterval(() => {
    flushOnce().catch(() => {});
  }, config.syncIntervalMs);

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
  if (netSub) {
    try { netSub.remove(); } catch { /* ignore */ }
    netSub = null;
  }
}
