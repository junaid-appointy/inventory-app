import { getDb, now } from './database';

export type KnownProduct = {
  barcode: string;
  name: string;
  category: string | null;
  unit: string | null;
  pack_size: number | null;
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
    SELECT barcode, name, category, unit, pack_size FROM products
    UNION
    SELECT barcode, name, category, unit, NULL AS pack_size FROM stock_levels
    WHERE barcode NOT IN (SELECT barcode FROM products)
    ORDER BY name COLLATE NOCASE
  `);
  return rows;
}

// ─── Canonical Product Catalog ───────────────────────────────────

export type CanonicalProduct = {
  product_id: string;
  canonical_name: string;
  category: string | null;
  hsn_code: string | null;
  unit: string;
  pack_size: number;
  /** 1 if any barcode is mapped to this product on the server, else 0.
   *  Drives the "hide already-taken products" filter when registering a
   *  brand-new barcode. SQLite has no bool, so it's stored as 0/1. */
  has_barcode: number;
  /** Most-recently learned real barcode mapped to this product on the
   *  server, or null. Read by the "No barcode" pick flow so it reuses
   *  the existing mapping instead of falling back to a synthetic id. */
  primary_barcode: string | null;
  updated_at: number;
};

export async function listCanonicalProducts(): Promise<CanonicalProduct[]> {
  const db = await getDb();
  return db.getAllAsync<CanonicalProduct>(
    'SELECT * FROM canonical_products ORDER BY canonical_name',
  );
}

export async function findCanonicalProductById(
  productId: string,
): Promise<CanonicalProduct | null> {
  const db = await getDb();
  return db.getFirstAsync<CanonicalProduct>(
    'SELECT * FROM canonical_products WHERE product_id = ?',
    [productId],
  );
}

export async function findCanonicalProductByBarcode(
  barcode: string,
): Promise<CanonicalProduct | null> {
  const db = await getDb();
  return db.getFirstAsync<CanonicalProduct>(
    `SELECT cp.* FROM canonical_products cp
     JOIN product_barcodes pb ON pb.product_id = cp.product_id
     WHERE pb.barcode = ?`,
    [barcode],
  );
}

/**
 * Return a real barcode already mapped to this product, if any.
 * Excludes synthetic `catalog_*` ids so a prior no-barcode pick doesn't
 * masquerade as a learned scan. Most-recently learned wins when several
 * physical barcodes are mapped to the same product (multiple brands /
 * batches).
 */
export async function findBarcodeForProduct(
  productId: string,
): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ barcode: string }>(
    `SELECT barcode FROM product_barcodes
     WHERE product_id = ? AND barcode NOT LIKE 'catalog\\_%' ESCAPE '\\'
     ORDER BY learned_at DESC
     LIMIT 1`,
    [productId],
  );
  return row?.barcode ?? null;
}

export async function upsertCanonicalProduct(product: CanonicalProduct): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO canonical_products (product_id, canonical_name, category, hsn_code, unit, pack_size, has_barcode, primary_barcode, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(product_id) DO UPDATE SET
       canonical_name = excluded.canonical_name,
       category = excluded.category,
       hsn_code = excluded.hsn_code,
       unit = excluded.unit,
       pack_size = excluded.pack_size,
       has_barcode = excluded.has_barcode,
       primary_barcode = excluded.primary_barcode,
       updated_at = excluded.updated_at`,
    [
      product.product_id,
      product.canonical_name,
      product.category,
      product.hsn_code,
      product.unit,
      product.pack_size,
      product.has_barcode ? 1 : 0,
      product.primary_barcode ?? null,
      product.updated_at,
    ],
  );
}

/**
 * Replace the entire canonical product catalog with fresh data
 * from the backend. Used during full sync.
 *
 * IMPORTANT: do NOT `DELETE FROM canonical_products` first — there is a
 * cascading FK from `product_barcodes`, so a blanket delete blows away
 * every learned barcode → product mapping the guard has built up.
 * Instead we upsert each remote row, then delete the ones the remote
 * no longer knows about.
 *
 * Per-row try/catch: one bad payload row used to abort the whole loop,
 * which left the local cache silently missing items further down the
 * list. Now we count failures and surface them so they can be diagnosed.
 */
export async function replaceCanonicalProducts(
  products: CanonicalProduct[],
): Promise<{ ok: number; failed: number; firstError?: string }> {
  const db = await getDb();
  let ok = 0;
  let failed = 0;
  let firstError: string | undefined;
  for (const p of products) {
    try {
      // Coerce fields the local schema marks NOT NULL — the server should
      // already enforce these, but a single bad row (e.g. unit migrated
      // from null) shouldn't drop the rest of the catalog.
      await upsertCanonicalProduct({
        product_id: String(p.product_id),
        canonical_name: String(p.canonical_name ?? ''),
        category: p.category ?? null,
        hsn_code: p.hsn_code ?? null,
        unit: p.unit ?? 'pcs',
        pack_size:
          typeof p.pack_size === 'number' && Number.isFinite(p.pack_size)
            ? p.pack_size
            : 1,
        has_barcode: p.has_barcode ? 1 : 0,
        primary_barcode: p.primary_barcode ?? null,
        updated_at: p.updated_at ?? Date.now(),
      });
      ok++;
    } catch (err) {
      failed++;
      if (!firstError) firstError = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn(`[catalog] upsert failed for ${p.product_id}:`, err);
    }
  }
  if (products.length === 0) return { ok, failed, firstError }; // empty payload — keep what we have

  // Drop products the remote no longer has. Bind ids as literals (the
  // list is small and ids are alphanumeric); a parameterised IN with
  // dynamic length is painful in expo-sqlite.
  const ids = products.map((p) => `'${String(p.product_id).replace(/'/g, "''")}'`).join(',');
  try {
    await db.execAsync(`DELETE FROM canonical_products WHERE product_id NOT IN (${ids})`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[catalog] stale-cleanup delete failed:', err);
  }
  return { ok, failed, firstError };
}

// ─── Barcode Learning ────────────────────────────────────────────

/**
 * Save a barcode → product mapping learned from a guard scan.
 * Next time this barcode is scanned, it auto-resolves.
 */
export async function learnBarcode(
  barcode: string,
  productId: string,
  learnedFrom: string = 'scan',
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO product_barcodes (barcode, product_id, learned_from, learned_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(barcode) DO UPDATE SET
       product_id = excluded.product_id,
       learned_from = excluded.learned_from,
       learned_at = excluded.learned_at`,
    [barcode, productId, learnedFrom, now()],
  );
}

// ─── Order Item Lookup by Product ID ─────────────────────────────

export async function findOpenItemByProductId(
  productId: string,
): Promise<{
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  expected_qty: number;
  received_qty: number;
} | null> {
  const db = await getDb();
  return db.getFirstAsync(
    `SELECT oi.* FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.product_id = ? AND o.status = 'open'
     ORDER BY o.expected_at ASC
     LIMIT 1`,
    [productId],
  );
}
