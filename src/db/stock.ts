import { getDb, now } from './database';

export type StockStatus = 'ok' | 'low' | 'out';

export type StockRow = {
  barcode: string;
  name: string;
  category: string | null;
  unit: string | null;
  pack_size: number | null;
  /** Defaulted to 'pack' at the DB layer when omitted by writers. */
  dispense_mode?: 'pack' | 'divisible';
  on_hand: number;
  threshold: number;
  /** Earliest expiry across this barcode's lots; null = no dated lot.
   *  Denormalised cache column, kept in step with `stock_lots`. */
  nearest_expiry?: string | null;
  /** Free-text shelf label ("Shelf A3"), set by an admin in ops-dashboard.
   *  Read-only here — a guard moving a tin is not a data entry task. */
  location?: string | null;
  /** Level at the last receipt or stocktake. Null until the item is next
   *  received or counted; callers hide the "of N stocked" line rather
   *  than falling back to pack size, which is not the same thing. */
  opening_qty?: number | null;
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
  dispense_mode?: 'pack' | 'divisible';
  on_hand?: number;
  threshold?: number;
}): Promise<void> {
  const db = await getDb();
  // COALESCE on pack_size/dispense_mode so a later receipt that doesn't
  // know them doesn't blank out values learned from the catalog.
  await db.runAsync(
    `INSERT INTO stock_levels (barcode, name, category, unit, pack_size, dispense_mode, on_hand, threshold, updated_at)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, 'pack'), ?, ?, ?)
     ON CONFLICT(barcode) DO UPDATE SET
       name=excluded.name,
       category=excluded.category,
       unit=excluded.unit,
       pack_size=COALESCE(excluded.pack_size, stock_levels.pack_size),
       dispense_mode=COALESCE(excluded.dispense_mode, stock_levels.dispense_mode),
       updated_at=excluded.updated_at`,
    [
      row.barcode,
      row.name,
      row.category,
      row.unit,
      row.pack_size ?? null,
      row.dispense_mode ?? null,
      row.on_hand ?? 0,
      row.threshold ?? 0,
      now(),
    ]
  );
}

/** The subset of a remote stock row we mirror locally. */
export type RemoteStockMirror = {
  barcode: string;
  name: string;
  category: string | null;
  unit: string | null;
  pack_size: number | null;
  dispense_mode?: 'pack' | 'divisible';
  on_hand: number;
  threshold: number;
  nearest_expiry?: string | null;
  location?: string | null;
  opening_qty?: number | null;
};

/**
 * Normalise one row off `api.fetch.stock()` into the shape the local
 * cache stores. Every screen that pulls stock goes through this so the
 * field set can't drift per call site — `nearest_expiry` used to be
 * dropped by four of the five callers, which left the local column
 * permanently null and made EditStock think the server had changed.
 */
export function remoteStockToLocal(r: {
  barcode: string;
  name: string;
  category: string | null;
  unit: string | null;
  pack_size: number | null;
  dispense_mode?: 'pack' | 'divisible';
  on_hand: number | string;
  threshold: number | string;
  nearest_expiry?: string | null;
  location?: string | null;
  opening_qty?: number | string | null;
}): RemoteStockMirror {
  return {
    barcode: r.barcode,
    name: r.name,
    category: r.category,
    unit: r.unit,
    pack_size: r.pack_size != null ? Number(r.pack_size) : null,
    dispense_mode: r.dispense_mode ?? 'pack',
    on_hand: Number(r.on_hand),
    threshold: Number(r.threshold),
    nearest_expiry: r.nearest_expiry ?? null,
    location: r.location ?? null,
    opening_qty: r.opening_qty != null ? Number(r.opening_qty) : null,
  };
}

/**
 * Replace the local cached stock row with the server's values. Used by
 * screens after a successful remote fetch so on-hand and threshold
 * reflect the source of truth.
 */
export async function syncStockFromRemote(row: RemoteStockMirror): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO stock_levels (barcode, name, category, unit, pack_size, dispense_mode, on_hand, threshold, nearest_expiry, location, opening_qty, updated_at)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, 'pack'), ?, ?, ?, ?, ?, ?)
     ON CONFLICT(barcode) DO UPDATE SET
       name=excluded.name,
       category=excluded.category,
       unit=excluded.unit,
       pack_size=excluded.pack_size,
       dispense_mode=excluded.dispense_mode,
       on_hand=excluded.on_hand,
       threshold=excluded.threshold,
       nearest_expiry=excluded.nearest_expiry,
       location=excluded.location,
       opening_qty=excluded.opening_qty,
       updated_at=excluded.updated_at`,
    [
      row.barcode,
      row.name,
      row.category,
      row.unit,
      row.pack_size,
      row.dispense_mode ?? null,
      row.on_hand,
      row.threshold,
      row.nearest_expiry ?? null,
      row.location ?? null,
      row.opening_qty ?? null,
      now(),
    ]
  );
}

/**
 * Replace the local stock cache with whatever the remote returned.
 * Upsert every remote row, then drop locally-cached rows the remote
 * no longer knows about. Prevents stale items lingering after an admin
 * wipes inventory data on the server.
 */
export async function replaceStockFromRemote(
  rows: RemoteStockMirror[],
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

/**
 * Mark the current level as the new starting amount. Call after a
 * receipt lands locally, mirroring the server's snapshotOpeningQty —
 * never after a dispense, or the "left of stocked" bar would never move.
 */
export async function snapshotOpeningLocal(barcode: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE stock_levels SET opening_qty = on_hand WHERE barcode = ?`,
    [barcode],
  );
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
  // A count restates the truth, so it becomes the new baseline too —
  // mirrors snapshotOpeningQty on the server so the optimistic view
  // doesn't flash a stale "of N stocked" before the next sync.
  await db.runAsync(
    `UPDATE stock_levels SET opening_qty = ? WHERE barcode = ?`,
    [Math.max(0, onHand), barcode],
  );
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
