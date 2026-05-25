import { getDb, now } from './database';

export type Product = {
  barcode: string;
  name: string;
  category: string | null;
  unit: string | null;
  updated_at: number;
};

export async function findProduct(barcode: string): Promise<Product | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Product>(
    'SELECT * FROM products WHERE barcode = ?',
    [barcode]
  );
  return row ?? null;
}

export async function upsertProduct(p: Omit<Product, 'updated_at'>): Promise<Product> {
  const db = await getDb();
  const ts = now();
  await db.runAsync(
    `INSERT INTO products (barcode, name, category, unit, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(barcode) DO UPDATE SET
       name=excluded.name, category=excluded.category, unit=excluded.unit, updated_at=excluded.updated_at`,
    [p.barcode, p.name, p.category, p.unit, ts]
  );
  return { ...p, updated_at: ts };
}

export async function listProducts(limit = 200): Promise<Product[]> {
  const db = await getDb();
  return db.getAllAsync<Product>(
    'SELECT * FROM products ORDER BY updated_at DESC LIMIT ?',
    [limit]
  );
}
