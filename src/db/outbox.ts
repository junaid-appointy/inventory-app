import { nanoid } from 'nanoid/non-secure';
import { getDb, now } from './database';

export type OutboxKind =
  | 'receipt'
  | 'product_registration'
  | 'issue'
  | 'reorder_request'
  | 'mismatch_flag';

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

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM outbox WHERE status IN ('queued', 'failed')`
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
    `UPDATE outbox SET status = 'sending', updated_at = ? WHERE id = ?`,
    [now(), id]
  );
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
