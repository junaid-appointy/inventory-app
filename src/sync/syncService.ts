import * as Network from 'expo-network';
import { config } from '../config';
import { markFailed, markSending, markSent, nextBatch, pendingCount } from '../db/outbox';
import { api } from './api';

type Listener = (count: number) => void;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
const listeners = new Set<Listener>();

export function onPendingChange(l: Listener): () => void {
  listeners.add(l);
  pendingCount().then(l).catch(() => {});
  return () => listeners.delete(l);
}

async function notify() {
  const c = await pendingCount().catch(() => 0);
  listeners.forEach((l) => l(c));
}

export async function flushOnce(): Promise<{ sent: number; failed: number }> {
  if (running) return { sent: 0, failed: 0 };
  running = true;
  let sent = 0;
  let failed = 0;
  try {
    const net = await Network.getNetworkStateAsync().catch(() => ({ isConnected: false }));
    if (!net.isConnected) return { sent, failed };

    const batch = await nextBatch(config.outboxBatchSize);
    for (const row of batch) {
      try {
        await markSending(row.id);
        const payload = JSON.parse(row.payload);
        if (row.kind === 'receipt') await api.postReceipt(payload);
        else if (row.kind === 'product_registration') await api.postProduct(payload);
        await markSent(row.id);
        sent++;
      } catch (err) {
        await markFailed(row.id, err instanceof Error ? err.message : String(err));
        failed++;
      }
    }
  } finally {
    running = false;
    await notify();
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
