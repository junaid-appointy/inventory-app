import { nanoid } from 'nanoid/non-secure';
import { getDb, now } from './database';

export type OutboxKind =
  | 'receipt'
  | 'product_registration'
  | 'issue'
  | 'dispense'
  | 'reorder_request'
  | 'mismatch_flag'
  | 'learn_barcode'
  | 'stock_correction';

/**
 * Lifecycle of one queued write.
 *
 * queued/sending/failed are transport states — where the row is on its
 * way to the server. The rest are what the SERVER decided once it got
 * there, reported back per row so the app can say what actually became
 * of the action instead of just "sent":
 *
 *  - `applied`                 — landed exactly as recorded.
 *  - `applied_with_adjustment` — landed, but the shelf held less than we
 *                                thought; a recount has been requested.
 *  - `superseded_by_count`     — a stocktake already included it, so
 *                                applying it again would double-count.
 *                                Reserved for the server's v2 ordering
 *                                policy; handled here now so enabling it
 *                                needs no app release.
 *  - `sent`                    — legacy/unknown: the server acknowledged
 *                                but told us nothing more. Older builds
 *                                and any endpoint that predates the
 *                                feedback contract land here.
 */
export type OutboxStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'applied'
  | 'applied_with_adjustment'
  | 'superseded_by_count';

/** Statuses meaning "the server has it; nothing more will happen." */
export const TERMINAL_OUTBOX_STATUSES: readonly OutboxStatus[] = [
  'sent',
  'applied',
  'applied_with_adjustment',
  'superseded_by_count',
];

export type OutboxRow = {
  id: string;
  kind: OutboxKind;
  payload: string;
  status: OutboxStatus;
  attempts: number;
  last_error: string | null;
  /** Plain-language sentence from the server about what happened. */
  server_note: string | null;
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

/**
 * Record the server's verdict for a row. `status` comes straight from
 * the write response; anything we don't recognise degrades to 'sent' so
 * a newer server can never strand a row in an unknown state.
 */
export async function markSent(
  id: string,
  outcome?: { status?: string | null; note?: string | null },
): Promise<void> {
  const db = await getDb();
  const known = TERMINAL_OUTBOX_STATUSES.includes(
    (outcome?.status ?? '') as OutboxStatus,
  );
  const status: OutboxStatus = known ? (outcome!.status as OutboxStatus) : 'sent';
  await db.runAsync(
    `UPDATE outbox SET status = ?, server_note = ?, updated_at = ? WHERE id = ?`,
    [status, outcome?.note ?? null, now(), id]
  );
}

/**
 * Rows that failed and have been retried enough times that this is not
 * just a flaky connection. This is the ONLY thing that earns a place in
 * the UI — normal queueing is the system's business, a write that keeps
 * bouncing is the user's.
 */
export async function stuckCount(minAttempts = 3): Promise<number> {
  const db = await getDb();
  const placeholders = INTERNAL_OUTBOX_KINDS.map(() => '?').join(',');
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM outbox
     WHERE status = 'failed' AND attempts >= ? AND kind NOT IN (${placeholders})`,
    [minAttempts, ...(INTERNAL_OUTBOX_KINDS as string[])]
  );
  return row?.c ?? 0;
}

/** Terminal rows carrying a server note the user hasn't been told about. */
export async function adjustedCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM outbox
     WHERE status IN ('applied_with_adjustment', 'superseded_by_count')`,
  );
  return row?.c ?? 0;
}

export async function markFailed(id: string, err: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE outbox SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?`,
    [err.slice(0, 500), now(), id]
  );
}
