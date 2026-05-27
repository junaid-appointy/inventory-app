import { nanoid } from 'nanoid/non-secure';
import { getDb, now } from './database';

// ---- Types ---------------------------------------------------------------

export type ExpiryTrackingRow = {
  id: string;
  barcode: string;
  product_name: string;
  expiry_date: string; // ISO date, e.g. "2027-03-15"
  qty: number;
  receipt_id: string | null;
  received_at: number;
  performed_by: string | null;
  performed_by_name: string | null;
};

export type ExpiryAlertRow = ExpiryTrackingRow & {
  /** Days until expiry (negative = already expired) */
  days_remaining: number;
};

// ---- Writes --------------------------------------------------------------

/**
 * Record that a received item has a specific expiry date.
 * Called from ReceivingScreen / OrderSessionContext after each receipt.
 */
export async function trackExpiry(params: {
  barcode: string;
  productName: string;
  expiryDate: string;
  qty: number;
  receiptId: string | null;
  performedBy: string | null;
  performedByName: string | null;
}): Promise<void> {
  const db = await getDb();
  const id = `exp_${nanoid(12)}`;
  await db.runAsync(
    `INSERT INTO expiry_tracking (id, barcode, product_name, expiry_date, qty, receipt_id, received_at, performed_by, performed_by_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.barcode,
      params.productName,
      params.expiryDate,
      params.qty,
      params.receiptId,
      now(),
      params.performedBy,
      params.performedByName,
    ],
  );

  // Update the stock_levels row's nearest_expiry if this one is sooner
  await db.runAsync(
    `UPDATE stock_levels
     SET nearest_expiry = CASE
       WHEN nearest_expiry IS NULL THEN ?
       WHEN ? < nearest_expiry THEN ?
       ELSE nearest_expiry
     END,
     updated_at = ?
     WHERE barcode = ?`,
    [params.expiryDate, params.expiryDate, params.expiryDate, now(), params.barcode],
  );
}

// ---- Reads ---------------------------------------------------------------

/**
 * List items expiring within the next `withinDays` days, ordered by soonest.
 * Also includes items that have *already expired* (negative days_remaining).
 */
export async function listExpiringSoon(withinDays: number = 30): Promise<ExpiryAlertRow[]> {
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0]; // "2026-05-27"
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const rows = await db.getAllAsync<ExpiryTrackingRow & { days_remaining: number }>(
    `SELECT *,
       CAST(julianday(expiry_date) - julianday(?) AS INTEGER) as days_remaining
     FROM expiry_tracking
     WHERE expiry_date <= ?
     ORDER BY expiry_date ASC
     LIMIT 200`,
    [today, cutoffStr],
  );
  return rows;
}

/**
 * List items that have already expired (expiry_date < today).
 */
export async function listExpired(): Promise<ExpiryAlertRow[]> {
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];
  return db.getAllAsync<ExpiryAlertRow>(
    `SELECT *,
       CAST(julianday(expiry_date) - julianday(?) AS INTEGER) as days_remaining
     FROM expiry_tracking
     WHERE expiry_date < ?
     ORDER BY expiry_date ASC
     LIMIT 200`,
    [today, today],
  );
}

/**
 * Count items expiring within N days (for badge/tile on home screen).
 */
export async function expiringCount(withinDays: number = 30): Promise<number> {
  const db = await getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const row = await db.getFirstAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM expiry_tracking WHERE expiry_date <= ?`,
    [cutoffStr],
  );
  return row?.cnt ?? 0;
}
