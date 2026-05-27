import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;

/**
 * Current schema version. Bump this and add a migration block in
 * `runMigrations()` whenever you need additive schema changes.
 */
const SCHEMA_VERSION = 2;

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
}

export function now(): number {
  return Date.now();
}
