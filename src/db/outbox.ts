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
  | 'stock_correction'
  | 'visitor_event'
  | 'item_photo';

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
 *  - `rejected`                — the server refused it (403, no
 *                                permission). Never retried in the
 *                                background; "Sync now" on the Sync queue
 *                                screen re-queues it once, so a write made
 *                                before a supervisor granted access is not
 *                                lost.
 */
export type OutboxStatus =
  | 'needs_review'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'applied'
  | 'applied_with_adjustment'
  | 'superseded_by_count'
  | 'rejected';

/** Statuses meaning "the server has it; nothing more will happen." */
export const TERMINAL_OUTBOX_STATUSES: readonly OutboxStatus[] = [
  'sent',
  'applied',
  'applied_with_adjustment',
  'superseded_by_count',
  'needs_review',
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
  /** When it was forwarded on WhatsApp from the "Not sent yet" screen. */
  shared_at: number | null;
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

export async function markRejected(id: string, err: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE outbox SET status = 'rejected', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?`,
    [err.slice(0, 500), now(), id]
  );
}

/** Writes the server refused for lack of permission. The person must act. */
export async function rejectedCount(): Promise<number> {
  const db = await getDb();
  const placeholders = INTERNAL_OUTBOX_KINDS.map(() => '?').join(',');
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM outbox WHERE status = 'rejected' AND kind NOT IN (${placeholders})`,
    INTERNAL_OUTBOX_KINDS as string[]
  );
  return row?.c ?? 0;
}

/** Give rejected rows one more go, e.g. after a supervisor granted access. */
export async function requeueRejected(): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `UPDATE outbox SET status = 'queued', updated_at = ? WHERE status = 'rejected'`,
    [now()]
  );
  return result.changes ?? 0;
}

/** Queued (not yet accepted) rows of one kind, e.g. gate actions captured offline. */
export async function pendingCountOfKind(kind: OutboxKind): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM outbox WHERE kind = ? AND status IN ('queued', 'failed', 'sending')`,
    [kind]
  );
  return row?.c ?? 0;
}

/**
 * Item photos still on this phone (not yet accepted by the server), by photo
 * id → their outbox status. Drives the clock on the WhatsApp-style ticks.
 */
export async function itemPhotosOnPhone(): Promise<Map<string, OutboxStatus>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ payload: string; status: OutboxStatus }>(
    `SELECT payload, status FROM outbox WHERE kind = 'item_photo' AND status IN ('queued', 'sending', 'failed', 'rejected')`,
  );
  const out = new Map<string, OutboxStatus>();
  for (const r of rows) {
    try {
      const id = (JSON.parse(r.payload) as { photo_id?: string }).photo_id;
      if (id) out.set(id, r.status);
    } catch {
      /* unreadable row: not a photo we can show */
    }
  }
  return out;
}

/** Not yet accepted by the server: what the "Not sent yet" screen lists. */
export const UNSENT_STATUSES: readonly OutboxStatus[] = ['queued', 'sending', 'failed', 'rejected'];

/**
 * How many rows are still waiting to reach the server, and since when. The
 * oldest time tells "still sending" apart from "the server is not taking
 * anything". Refused rows are left out: the server was reached, and they
 * have their own warning.
 */
export async function unsentSummary(): Promise<{ count: number; oldestAt: number | null }> {
  const db = await getDb();
  const hidden = INTERNAL_OUTBOX_KINDS.map(() => '?').join(',');
  const row = await db.getFirstAsync<{ c: number; oldest: number | null }>(
    `SELECT COUNT(*) AS c, MIN(created_at) AS oldest FROM outbox
     WHERE status IN ('queued', 'sending', 'failed') AND kind NOT IN (${hidden}, 'item_photo')`,
    INTERNAL_OUTBOX_KINDS as string[],
  );
  return { count: row?.c ?? 0, oldestAt: row?.oldest ?? null };
}

/** Remember that these rows were forwarded on WhatsApp. */
export async function markShared(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  await db.runAsync(
    `UPDATE outbox SET shared_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
    [now(), ...ids],
  );
}

/**
 * Wait briefly for one row to leave the queue, so a screen can say
 * "done" when the server took it at once, or "saved for later" when not.
 */
export async function waitUntilSent(id: string, ms = 6000): Promise<boolean> {
  const db = await getDb();
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const row = await db.getFirstAsync<{ status: OutboxStatus }>('SELECT status FROM outbox WHERE id = ?', [id]);
    if (!row) return true;
    if (!UNSENT_STATUSES.includes(row.status)) return true;
    if (row.status === 'failed' || row.status === 'rejected') return false;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
