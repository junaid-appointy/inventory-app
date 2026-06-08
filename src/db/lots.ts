import { getDb, now } from './database';

export type Lot = {
  /** ISO YYYY-MM-DD; null means "no expiry". */
  expiry_date: string | null;
  qty: number;
};

/**
 * List current lots for a barcode, FEFO-ordered (earliest expiry first,
 * NULL last). Used by EditStock to seed the BatchEditor and by Dispense
 * to surface the picker.
 */
export async function listLots(barcode: string): Promise<Lot[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ expiry_date: string | null; qty: number }>(
    `SELECT expiry_date, qty FROM stock_lots
      WHERE barcode = ? AND qty > 0
      ORDER BY (expiry_date IS NULL), expiry_date ASC`,
    [barcode],
  );
  return rows.map((r) => ({ expiry_date: r.expiry_date, qty: Number(r.qty) }));
}

/**
 * Replace all lots for a barcode with the given list. Used when the
 * server returns a fresh snapshot (warmCache, post-write refetch) and
 * when EditStock commits a correction.
 */
export async function replaceLotsLocal(
  barcode: string,
  lots: Lot[],
): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM stock_lots WHERE barcode = ?`, [barcode]);
  // Coalesce duplicates so the unique index holds.
  const merged = new Map<string, number>();
  for (const lot of lots) {
    if (lot.qty <= 0) continue;
    const key = lot.expiry_date ?? '__no_expiry__';
    merged.set(key, (merged.get(key) ?? 0) + Number(lot.qty));
  }
  let i = 0;
  const ts = now();
  for (const [key, qty] of merged) {
    const expiry = key === '__no_expiry__' ? null : key;
    await db.runAsync(
      `INSERT INTO stock_lots (id, barcode, expiry_date, qty, source, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [`lot_${ts}_${i++}_${Math.floor(Math.random() * 1e6)}`, barcode, expiry, qty, 'sync', ts],
    );
  }
}

/**
 * Add qty to a single lot identified by (barcode, expiry). Used on
 * optimistic write from ReceivingScreen so the BatchEditor reflects
 * the new pack before the server round-trip.
 */
export async function addLotLocal(
  barcode: string,
  expiry: string | null,
  qty: number,
): Promise<void> {
  if (qty <= 0) return;
  const db = await getDb();
  const key = expiry ?? '__no_expiry__';
  const existing = await db.getFirstAsync<{ id: string; qty: number }>(
    `SELECT id, qty FROM stock_lots
      WHERE barcode = ? AND COALESCE(expiry_date, '__no_expiry__') = ?
      LIMIT 1`,
    [barcode, key],
  );
  const ts = now();
  if (existing) {
    await db.runAsync(
      `UPDATE stock_lots SET qty = qty + ?, updated_at = ? WHERE id = ?`,
      [qty, ts, existing.id],
    );
  } else {
    await db.runAsync(
      `INSERT INTO stock_lots (id, barcode, expiry_date, qty, source, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [`lot_${ts}_${Math.floor(Math.random() * 1e6)}`, barcode, expiry, qty, 'receipt', ts],
    );
  }
}

/**
 * Subtract qty from lots. Mirrors the server's decrementLots: explicit
 * picks when provided, FEFO otherwise. Returns the actual breakdown
 * applied so the dispense flow can include it in the outbox payload.
 */
export async function decrementLotsLocal(
  barcode: string,
  totalQty: number,
  picks?: Lot[] | null,
): Promise<Lot[]> {
  if (totalQty <= 0) return [];
  const db = await getDb();
  const applied: Lot[] = [];
  const ts = now();

  if (picks && picks.length > 0) {
    for (const pick of picks) {
      if (pick.qty <= 0) continue;
      const key = pick.expiry_date ?? '__no_expiry__';
      const lot = await db.getFirstAsync<{ id: string; qty: number }>(
        `SELECT id, qty FROM stock_lots
          WHERE barcode = ? AND COALESCE(expiry_date, '__no_expiry__') = ?
          LIMIT 1`,
        [barcode, key],
      );
      if (!lot) continue;
      const take = Math.min(Number(lot.qty), pick.qty);
      if (take <= 0) continue;
      await db.runAsync(
        `UPDATE stock_lots SET qty = qty - ?, updated_at = ? WHERE id = ?`,
        [take, ts, lot.id],
      );
      applied.push({ expiry_date: pick.expiry_date, qty: take });
    }
  } else {
    let remaining = totalQty;
    const lots = await db.getAllAsync<{ id: string; expiry_date: string | null; qty: number }>(
      `SELECT id, expiry_date, qty FROM stock_lots
        WHERE barcode = ? AND qty > 0
        ORDER BY (expiry_date IS NULL), expiry_date ASC`,
      [barcode],
    );
    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = Math.min(Number(lot.qty), remaining);
      await db.runAsync(
        `UPDATE stock_lots SET qty = qty - ?, updated_at = ? WHERE id = ?`,
        [take, ts, lot.id],
      );
      applied.push({ expiry_date: lot.expiry_date, qty: take });
      remaining -= take;
    }
  }

  await db.runAsync(`DELETE FROM stock_lots WHERE barcode = ? AND qty <= 0`, [barcode]);
  return applied;
}

/**
 * Drop lots for barcodes the remote no longer knows about. Mirrors the
 * stock-level reaping in replaceStockFromRemote so a wiped product
 * doesn't leave orphan lots behind.
 */
export async function pruneLotsToBarcodes(barcodes: string[]): Promise<void> {
  const db = await getDb();
  if (barcodes.length === 0) {
    await db.runAsync(`DELETE FROM stock_lots`);
    return;
  }
  const ids = barcodes.map((b) => `'${String(b).replace(/'/g, "''")}'`).join(',');
  await db.runAsync(`DELETE FROM stock_lots WHERE barcode NOT IN (${ids})`);
}
