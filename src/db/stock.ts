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

/**
 * Seed demo stock once so Stock/Alerts/Issue screens show something on a
 * fresh install. Idempotent: skipped if any stock row already exists.
 */
export async function seedDemoStockIfEmpty(): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM stock_levels'
  );
  if ((existing?.c ?? 0) > 0) return;
  const ts = now();
  const seed: Array<[string, string, string, string, number, number]> = [
    ['8901030875021', 'A4 Printer Paper',     'Stationery', 'Pack',  12, 6],
    ['8901001234567', 'Blue Ballpoint Pens',  'Stationery', 'Box',    3, 5],
    ['8902080000034', 'Floor Cleaner 1L',     'Cleaning',   'Litre',  0, 4],
    ['8901491100012', 'Toilet Paper Rolls',   'Cleaning',   'Pack',   8, 8],
    ['8901058000023', 'Tea Bags (100ct)',     'Pantry',     'Box',    5, 4],
    ['8901491307041', 'Coffee Powder 200g',   'Pantry',     'Piece',  1, 3],
    ['8901030698778', 'HDMI Cable 1.8m',      'IT supplies','Piece',  2, 2],
    ['8901138514525', 'USB-C Charger 20W',    'IT supplies','Piece',  6, 3],
  ];
  for (const [barcode, name, category, unit, on_hand, threshold] of seed) {
    await db.runAsync(
      `INSERT INTO stock_levels (barcode, name, category, unit, on_hand, threshold, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [barcode, name, category, unit, on_hand, threshold, ts]
    );
  }
}
