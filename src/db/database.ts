import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;

/**
 * Current schema version. Bump this and add a migration block in
 * `runMigrations()` whenever you need additive schema changes.
 */
const SCHEMA_VERSION = 8;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  const db = await SQLite.openDatabaseAsync('fieldapp.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS products (
      barcode TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      unit TEXT,
      pack_size REAL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      vendor TEXT,
      expected_at INTEGER,
      status TEXT NOT NULL DEFAULT 'open',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      barcode TEXT,
      product_name TEXT NOT NULL,
      expected_qty REAL NOT NULL,
      received_qty REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      barcode TEXT NOT NULL,
      product_name TEXT NOT NULL,
      qty REAL NOT NULL,
      scanned_at INTEGER NOT NULL,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

    CREATE TABLE IF NOT EXISTS stock_levels (
      barcode TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      unit TEXT,
      pack_size REAL,
      on_hand REAL NOT NULL DEFAULT 0,
      threshold REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_stock_category ON stock_levels(category);
  `);

  await runMigrations(db);
  dbInstance = db;
  return db;
}

/**
 * Forward-only migrations keyed by PRAGMA user_version. Each migration
 * runs once; version is bumped after success. ALTER TABLE ADD COLUMN is
 * idempotent in SQLite (errors if column exists), so we guard with the
 * version check rather than catching errors.
 */
async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  let version = row?.user_version ?? 0;

  if (version < 1) {
    await db.execAsync(`
      -- Per-scan expiry and audit columns on receipts
      ALTER TABLE receipts ADD COLUMN expiry_date TEXT;
      ALTER TABLE receipts ADD COLUMN performed_by TEXT;
      ALTER TABLE receipts ADD COLUMN performed_by_name TEXT;

      -- Audit trail table
      CREATE TABLE IF NOT EXISTS activity_log (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        barcode TEXT,
        qty REAL,
        expiry_date TEXT,
        performed_by TEXT,
        performed_by_name TEXT,
        performed_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action);
      CREATE INDEX IF NOT EXISTS idx_activity_barcode ON activity_log(barcode);

      PRAGMA user_version = 1;
    `);
    version = 1;
  }

  // Future migrations go here:
  // if (version < 3) { ... PRAGMA user_version = 3; }

  if (version < 2) {
    await db.execAsync(`
      -- Track nearest expiry per stock item for quick alert queries
      ALTER TABLE stock_levels ADD COLUMN nearest_expiry TEXT;

      -- Per-receipt expiry tracking. Each received item with an expiry date
      -- gets a row here. This lets us query "what's expiring in the next N days"
      -- and trace it back to the order/receipt it came from.
      CREATE TABLE IF NOT EXISTS expiry_tracking (
        id TEXT PRIMARY KEY,
        barcode TEXT NOT NULL,
        product_name TEXT NOT NULL,
        expiry_date TEXT NOT NULL,
        qty REAL NOT NULL,
        receipt_id TEXT,
        received_at INTEGER NOT NULL,
        performed_by TEXT,
        performed_by_name TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_expiry_barcode ON expiry_tracking(barcode);
      CREATE INDEX IF NOT EXISTS idx_expiry_date ON expiry_tracking(expiry_date);

      PRAGMA user_version = 2;
    `);
    version = 2;
  }

  if (version < 3) {
    await db.execAsync(`
      -- Canonical product catalog (synced from backend).
      -- Guards pick from this list — no free-text product names.
      CREATE TABLE IF NOT EXISTS canonical_products (
        product_id TEXT PRIMARY KEY,
        canonical_name TEXT NOT NULL,
        category TEXT,
        hsn_code TEXT,
        unit TEXT NOT NULL DEFAULT 'pcs',
        pack_size REAL NOT NULL DEFAULT 1,
        has_barcode INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_canonical_name ON canonical_products(canonical_name);
      CREATE INDEX IF NOT EXISTS idx_canonical_hsn ON canonical_products(hsn_code);

      -- Learned barcode → canonical product mappings.
      -- Populated when guard scans a barcode + picks from catalog.
      CREATE TABLE IF NOT EXISTS product_barcodes (
        barcode TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        learned_from TEXT NOT NULL DEFAULT 'scan',
        learned_at INTEGER NOT NULL,
        FOREIGN KEY (product_id) REFERENCES canonical_products(product_id) ON DELETE CASCADE
      );

      -- Link order items to canonical products for name-based matching
      ALTER TABLE order_items ADD COLUMN product_id TEXT;

      CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

      PRAGMA user_version = 3;
    `);
    version = 3;
  }

  if (version < 4) {
    // Fresh installs already have pack_size from the initial CREATE TABLE;
    // only older DBs (created before the column was added to the base schema)
    // need the ALTER. Probe table_info to decide.
    const cols = await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(products)',
    );
    const hasPackSize = cols.some((c) => c.name === 'pack_size');
    if (!hasPackSize) {
      await db.execAsync(`ALTER TABLE products ADD COLUMN pack_size REAL;`);
    }
    await db.execAsync(`PRAGMA user_version = 4;`);
    version = 4;
  }

  if (version < 5) {
    // Mirror the canonical product's pack_size onto stock so the Stock
    // screen can render "{on_hand} × {pack_size} {unit}" without an extra
    // join at read time.
    const cols = await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(stock_levels)',
    );
    const hasPackSize = cols.some((c) => c.name === 'pack_size');
    if (!hasPackSize) {
      await db.execAsync(`ALTER TABLE stock_levels ADD COLUMN pack_size REAL;`);
    }
    await db.execAsync(`PRAGMA user_version = 5;`);
    version = 5;
  }

  if (version < 6) {
    // Track whether each canonical product already has a barcode mapped
    // server-side. The register-new-barcode suggestion list filters these
    // out so two barcodes can't map to the same product (current rule).
    const cols = await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(canonical_products)',
    );
    const hasBarcodeCol = cols.some((c) => c.name === 'has_barcode');
    if (!hasBarcodeCol) {
      await db.execAsync(`ALTER TABLE canonical_products ADD COLUMN has_barcode INTEGER NOT NULL DEFAULT 0;`);
    }
    await db.execAsync(`PRAGMA user_version = 6;`);
    version = 6;
  }

  if (version < 7) {
    // Cache the canonical product's primary (most-recent) barcode locally
    // so the "No barcode → catalog pick" path can reuse an existing
    // mapping created by another guard / admin / bill upload without a
    // round-trip. Without this, the device only knows barcodes IT has
    // learned, so a server-side mapping invisible here forces the synthetic
    // `catalog_*` id and the "No barcode yet" chip on the receiving screen.
    const cols = await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(canonical_products)',
    );
    const hasPrimary = cols.some((c) => c.name === 'primary_barcode');
    if (!hasPrimary) {
      await db.execAsync(`ALTER TABLE canonical_products ADD COLUMN primary_barcode TEXT;`);
    }
    await db.execAsync(`PRAGMA user_version = 7;`);
    version = 7;
  }

  if (version < 8) {
    // Per-expiry batches ("lots"), mirroring the server's
    // inventory_stock_lots. Each row is "qty of this barcode that share
    // this expiry". Receipts insert/merge by (barcode, expiry); dispenses
    // decrement FEFO or by explicit picks; corrections replace the set
    // for a barcode wholesale. NULL expiry = "no expiry" — collapses
    // into a single lot keyed by the sentinel below for uniqueness.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS stock_lots (
        id TEXT PRIMARY KEY,
        barcode TEXT NOT NULL,
        expiry_date TEXT,
        qty REAL NOT NULL DEFAULT 0,
        source TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_stock_lots_barcode ON stock_lots(barcode);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_lots_barcode_expiry
        ON stock_lots(barcode, COALESCE(expiry_date, '__no_expiry__'));
      PRAGMA user_version = 8;
    `);
    version = 8;
  }
}

export function now(): number {
  return Date.now();
}
