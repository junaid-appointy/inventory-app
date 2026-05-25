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
