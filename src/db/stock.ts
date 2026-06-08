import { getDb, now } from './database';

export type StockStatus = 'ok' | 'low' | 'out';

export type StockRow = {
  barcode: string;
  name: string;
  category: string | null;
  unit: string | null;
  pack_size: number | null;
  on_hand: number;
  threshold: number;
  updated_at: number;
};

export function statusFor(row: Pick<StockRow, 'on_hand' | 'threshold'>): StockStatus {
  if (row.on_hand <= 0) return 'out';
  if (row.on_hand <= row.threshold) return 'low';
  return 'ok';
}

export async function listStock(): Promise<StockRow[]> {
  const db = await getDb();
  return db.getAllAsync<StockRow>('SELECT * FROM stock_levels ORDER BY name COLLATE NOCASE ASC');
}

export async function listLowOrOut(): Promise<StockRow[]> {
  const db = await getDb();
  return db.getAllAsync<StockRow>(
    `SELECT * FROM stock_levels WHERE on_hand <= threshold ORDER BY on_hand ASC, name COLLATE NOCASE ASC`
  );
}

export async function findStock(barcode: string): Promise<StockRow | null> {
  const db = await getDb();
  return (
    (await db.getFirstAsync<StockRow>('SELECT * FROM stock_levels WHERE barcode = ?', [barcode])) ??
    null
  );
}

export async function upsertStock(row: {
  barcode: string;
  name: string;
  category: string | null;
  unit: string | null;
  pack_size?: number | null;
  on_hand?: number;
  threshold?: number;
}): Promise<void> {
  const db = await getDb();
  // COALESCE on pack_size so a later receipt that doesn't know the pack
  // size doesn't blank out a value learned from the catalog/registration.
  await db.runAsync(
    `INSERT INTO stock_levels (barcode, name, category, unit, pack_size, on_hand, threshold, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(barcode) DO UPDATE SET
       name=excluded.name,
       category=excluded.category,
       unit=excluded.unit,
       pack_size=COALESCE(excluded.pack_size, stock_levels.pack_size),
       updated_at=excluded.updated_at`,
    [
      row.barcode,
      row.name,
      row.category,
      row.unit,
      row.pack_size ?? null,
      row.on_hand ?? 0,
      row.threshold ?? 0,
      now(),
    ]
  );
}

/**
 * Replace the local cached stock row with the server's values. Used by
 * screens after a successful remote fetch so on-hand and threshold
 * reflect the source of truth.
 */
export async function syncStockFromRemote(row: {
  barcode: string;
  name: string;
  category: string | null;
  unit: string | null;
  pack_size: number | null;
  on_hand: number;
  threshold: number;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO stock_levels (barcode, name, category, unit, pack_size, on_hand, threshold, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(barcode) DO UPDATE SET
       name=excluded.name,
       category=excluded.category,
       unit=excluded.unit,
       pack_size=excluded.pack_size,
       on_hand=excluded.on_hand,
       threshold=excluded.threshold,
       updated_at=excluded.updated_at`,
    [row.barcode, row.name, row.category, row.unit, row.pack_size, row.on_hand, row.threshold, now()]
  );
}

/**
 * Replace the local stock cache with whatever the remote returned.
 * Upsert every remote row, then drop locally-cached rows the remote
 * no longer knows about. Prevents stale items lingering after an admin
 * wipes inventory data on the server.
 */
export async function replaceStockFromRemote(
  rows: Array<{
    barcode: string;
    name: string;
    category: string | null;
    unit: string | null;
    pack_size: number | null;
    on_hand: number;
    threshold: number;
  }>,
): Promise<void> {
  const db = await getDb();
  for (const row of rows) {
    await syncStockFromRemote(row);
  }
  if (rows.length === 0) {
    // Remote is empty — wipe local too.
    await db.runAsync(`DELETE FROM stock_levels`);
    return;
  }
  const ids = rows.map((r) => `'${String(r.barcode).replace(/'/g, "''")}'`).join(',');
  await db.runAsync(`DELETE FROM stock_levels WHERE barcode NOT IN (${ids})`);
}

export async function adjustOnHand(barcode: string, delta: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE stock_levels SET on_hand = MAX(0, on_hand + ?), updated_at = ? WHERE barcode = ?`,
    [delta, now(), barcode]
  );
}

/**
 * Set on_hand and nearest_expiry directly. Used by the "Edit stock"
 * correction flow — guard is overwriting the count/expiry, not adding or
 * dispensing. Caller is also expected to enqueue a `stock_correction` row
 * so the server keeps an audit trail.
 */
export async function correctStockLocal(
  barcode: string,
  onHand: number,
  expiry: string | null,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE stock_levels SET on_hand = ?, nearest_expiry = ?, updated_at = ? WHERE barcode = ?`,
    [Math.max(0, onHand), expiry, now(), barcode],
  );
}

/** Read the current row's nearest_expiry (TEXT column added in migration 2). */
export async function getNearestExpiry(barcode: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ nearest_expiry: string | null }>(
    `SELECT nearest_expiry FROM stock_levels WHERE barcode = ?`,
    [barcode],
  );
  return row?.nearest_expiry ?? null;
}
