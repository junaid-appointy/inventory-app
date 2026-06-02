import { getDb } from './database';

export type Order = {
  id: string;
  vendor: string | null;
  expected_at: number | null;
  status: string;
  updated_at: number;
};

export type OrderItem = {
  id: string;
  order_id: string;
  barcode: string | null;
  product_name: string;
  expected_qty: number;
  received_qty: number;
};

export async function listOpenOrders(): Promise<Order[]> {
  const db = await getDb();
  return db.getAllAsync<Order>(
    `SELECT * FROM orders WHERE status = 'open' ORDER BY expected_at ASC NULLS LAST`
  );
}

export async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  const db = await getDb();
  return db.getAllAsync<OrderItem>(
    'SELECT * FROM order_items WHERE order_id = ?',
    [orderId]
  );
}

export async function findOpenItemByBarcode(barcode: string): Promise<OrderItem | null> {
  const db = await getDb();
  return (
    (await db.getFirstAsync<OrderItem>(
      `SELECT oi.* FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.barcode = ? AND o.status = 'open'
       ORDER BY o.expected_at ASC LIMIT 1`,
      [barcode]
    )) ?? null
  );
}

export async function addReceivedQty(itemId: string, delta: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE order_items SET received_qty = received_qty + ? WHERE id = ?',
    [delta, itemId]
  );
}

/**
 * Mirror the backend's open orders into local SQLite so
 *   - ReceivingScreen.findOpenItemByProductId() can resolve a guard's
 *     catalog pick to the right order_item even when offline, and
 *   - addReceivedQty(...) can increment progress locally.
 *
 * Replaces every row for the given order id. Receipts (in inventory_receipts)
 * keep linking to the same order_item_id so audit history is preserved.
 */
export type RemoteOrderInput = {
  id: string;
  vendor: string | null;
  expected_at: string | null;
  status: string;
  items: Array<{
    id: string;
    order_id: string;
    barcode: string | null;
    product_name: string;
    product_id?: string | null;
    expected_qty: number;
    received_qty: number;
  }>;
};

export async function upsertOrdersFromRemote(remote: RemoteOrderInput[]): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  for (const o of remote) {
    await db.runAsync(
      `INSERT INTO orders (id, vendor, expected_at, status, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         vendor = excluded.vendor,
         expected_at = excluded.expected_at,
         status = excluded.status,
         updated_at = excluded.updated_at`,
      [o.id, o.vendor, o.expected_at ? new Date(o.expected_at).getTime() : null, o.status, now],
    );
    // Reset items for this order — server is source of truth for what's expected.
    await db.runAsync('DELETE FROM order_items WHERE order_id = ?', [o.id]);
    for (const it of o.items) {
      await db.runAsync(
        `INSERT INTO order_items (id, order_id, barcode, product_name, product_id, expected_qty, received_qty)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          it.id,
          o.id,
          it.barcode ?? null,
          it.product_name,
          it.product_id ?? null,
          Number(it.expected_qty),
          Number(it.received_qty),
        ],
      );
    }
  }

  // Drop orders that the remote no longer returns.
  if (remote.length > 0) {
    const ids = remote.map((o) => `'${String(o.id).replace(/'/g, "''")}'`).join(',');
    await db.runAsync(`DELETE FROM orders WHERE id NOT IN (${ids})`);
  } else {
    await db.runAsync(`DELETE FROM orders WHERE status = 'open'`);
  }
}
