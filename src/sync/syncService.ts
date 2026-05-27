import * as Network from 'expo-network';
import { config } from '../config';
import { OutboxKind } from '../db/outbox';
import { markFailed, markSending, markSent, nextBatch, pendingCount } from '../db/outbox';
import { api } from './api';

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

export function startSync(): void {
  if (timer) return;
  flushOnce().catch(() => {});
  timer = setInterval(() => {
    flushOnce().catch(() => {});
  }, config.syncIntervalMs);
}

export function stopSync(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
