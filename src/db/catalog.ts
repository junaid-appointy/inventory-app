import { getDb } from './database';

export type KnownProduct = {
  barcode: string;
  name: string;
  category: string | null;
  unit: string | null;
};

/**
 * Union of every product the device knows about: locally-registered
 * products + every row mirrored from the remote stock cache. Used by
 * the fuzzy-suggest hook so the user can be offered an existing name
 * before they type it out from scratch (or misspell it).
 *
 * Dedups on barcode, preferring the locally-registered product entry
 * when both sources have it (it's the authoritative name on this device).
 */
export async function listKnownProducts(): Promise<KnownProduct[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<KnownProduct>(`
    SELECT barcode, name, category, unit FROM products
    UNION
    SELECT barcode, name, category, unit FROM stock_levels
    WHERE barcode NOT IN (SELECT barcode FROM products)
    ORDER BY name COLLATE NOCASE
  `);
  return rows;
}
