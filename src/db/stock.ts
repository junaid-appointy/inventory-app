import { getDb, now } from './database';

export type StockStatus = 'ok' | 'low' | 'out';

export type StockRow = {
  barcode: string;
  name: string;
  category: string | null;
  unit: string | null;
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
  on_hand?: number;
  threshold?: number;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO stock_levels (barcode, name, category, unit, on_hand, threshold, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(barcode) DO UPDATE SET
       name=excluded.name, category=excluded.category, unit=excluded.unit, updated_at=excluded.updated_at`,
    [
      row.barcode,
      row.name,
      row.category,
      row.unit,
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
  on_hand: number;
  threshold: number;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO stock_levels (barcode, name, category, unit, on_hand, threshold, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(barcode) DO UPDATE SET
       name=excluded.name,
       category=excluded.category,
       unit=excluded.unit,
       on_hand=excluded.on_hand,
       threshold=excluded.threshold,
       updated_at=excluded.updated_at`,
    [row.barcode, row.name, row.category, row.unit, row.on_hand, row.threshold, now()]
  );
}

export async function adjustOnHand(barcode: string, delta: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE stock_levels SET on_hand = MAX(0, on_hand + ?), updated_at = ? WHERE barcode = ?`,
    [delta, now(), barcode]
  );
}
