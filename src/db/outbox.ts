import { nanoid } from 'nanoid/non-secure';
import { getDb, now } from './database';

export type OutboxKind =
  | 'receipt'
  | 'product_registration'
  | 'issue'
  | 'dispense'
  | 'reorder_request'
  | 'mismatch_flag'
  | 'learn_barcode';

export type OutboxRow = {
  id: string;
  kind: OutboxKind;
  payload: string;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  attempts: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
};

export async function enqueue(kind: OutboxKind, payload: object): Promise<string> {
  const db = await getDb();
  const id = `out_${nanoid(12)}`;
  const ts = now();
  await db.runAsync(
    `INSERT INTO outbox (id, kind, payload, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, 'queued', 0, ?, ?)`,
    [id, kind, JSON.stringify(payload), ts, ts]
  );
  return id;
}

/**
 * Outbox kinds that the user shouldn't see in the Sync Queue UI or
 * count in the Home badge. They still flush in the background; they're
 * just internal plumbing (e.g. teaching the server a new barcode →
 * product alias) that the user never explicitly triggered.
 */
export const INTERNAL_OUTBOX_KINDS: readonly OutboxKind[] = ['learn_barcode'];

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  const placeholders = INTERNAL_OUTBOX_KINDS.map(() => '?').join(',');
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM outbox
     WHERE status IN ('queued', 'failed') AND kind NOT IN (${placeholders})`,
    INTERNAL_OUTBOX_KINDS as string[]
  );
  return row?.c ?? 0;
}

export async function nextBatch(limit: number): Promise<OutboxRow[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxRow>(
    `SELECT * FROM outbox WHERE status IN ('queued', 'failed')
     ORDER BY created_at ASC LIMIT ?`,
    [limit]
  );
}

export async function markSending(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE outbox SET status = 'sending', last_error = NULL, updated_at = ? WHERE id = ?`,
    [now(), id]
  );
}

/**
 * Reset rows orphaned mid-flight (process killed, OS reclaim, crash)
 * back to 'queued' so the next flush picks them up. Without this they
 * stay 'sending' forever — `nextBatch` only selects queued/failed.
 */
export async function recoverOrphanedSending(): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `UPDATE outbox SET status = 'queued', updated_at = ? WHERE status = 'sending'`,
    [now()]
  );
  return result.changes ?? 0;
}

export async function markSent(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE outbox SET status = 'sent', updated_at = ? WHERE id = ?`,
    [now(), id]
  );
}

export async function markFailed(id: string, err: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE outbox SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?`,
    [err.slice(0, 500), now(), id]
  );
}
