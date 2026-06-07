import { nanoid } from 'nanoid/non-secure';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { enqueue } from '../../../db/outbox';
import { trackExpiry } from '../../../db/expiry';
import { adjustOnHand, findStock, upsertStock } from '../../../db/stock';
import { findProduct } from '../../../db/products';
import { addReceivedQty, findOpenItemByBarcode } from '../../../db/orders';
import { findOpenItemByProductId, learnBarcode } from '../../../db/catalog';
import { getSession } from '../../../auth/session';
import { flushOnce, syncOrders } from '../../../sync/syncService';
import { now } from '../../../db/database';

export type OrderBatch = {
  qty: number;
  expiry: string | null; // ISO date, e.g. "2027-03-15"
};

export type OrderSessionItem = {
  barcode: string;
  /** Canonical product id when the user picked one from the catalog. Lets
   *  the receipt link back to the right order_item and lets us learn the
   *  barcode → product mapping for next time. */
  productId?: string | null;
  name: string;
  category: string | null;
  unit: string | null;
  /** Pack size (unit value) for display: "qty × packSize unit". */
  packSize?: number | null;
  /** Total qty across all batches. Kept in sync with sum(batches[].qty). */
  qty: number;
  /** One row per distinct expiry. Single-expiry receipts have one batch;
   *  per-pack-expiry receipts have N batches of qty=1. */
  batches: OrderBatch[];
};

type OrderSessionCtx = {
  items: OrderSessionItem[];
  addItem: (item: OrderSessionItem) => void;
  removeItem: (barcode: string) => void;
  updateItemQty: (barcode: string, qty: number) => void;
  clear: () => void;
  submitAll: () => Promise<void>;
  isActive: boolean;
  /** Last expiry date entered — used for "same as last" auto-fill */
  lastExpiry: string | null;
};

const Ctx = createContext<OrderSessionCtx | null>(null);

export function OrderSessionProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<OrderSessionItem[]>([]);
  const [lastExpiry, setLastExpiry] = useState<string | null>(null);

  const addItem = useCallback((item: OrderSessionItem) => {
    // "Same as last" auto-fill uses the most recent non-null expiry the
    // guard explicitly set, regardless of which batch it came from.
    const lastNonNull = [...item.batches].reverse().find((b) => b.expiry)?.expiry;
    if (lastNonNull) setLastExpiry(lastNonNull);
    setItems((prev) => {
      const existing = prev.find((i) => i.barcode === item.barcode);
      if (existing) {
        // Merge by concatenating batches so distinct expiries survive a
        // re-scan of the same product.
        return prev.map((i) =>
          i.barcode === item.barcode
            ? {
                ...i,
                qty: i.qty + item.qty,
                batches: [...i.batches, ...item.batches],
              }
            : i,
        );
      }
      return [...prev, item];
    });
  }, []);

  const removeItem = useCallback((barcode: string) => {
    setItems((prev) => prev.filter((i) => i.barcode !== barcode));
  }, []);

  const updateItemQty = useCallback((barcode: string, qty: number) => {
    // Collapses batches into a single batch carrying the earliest expiry —
    // safe default since manual qty edits can't reconcile against multiple
    // distinct expiries.
    setItems((prev) =>
      prev.map((i) => {
        if (i.barcode !== barcode) return i;
        const earliest = i.batches
          .map((b) => b.expiry)
          .filter((e): e is string => !!e)
          .sort()[0] ?? null;
        return { ...i, qty, batches: [{ qty, expiry: earliest }] };
      }),
    );
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setLastExpiry(null);
  }, []);

  const submitAll = useCallback(async () => {
    const session = getSession();
    const performedBy = session?.guardId ?? null;
    const performedByName = session?.guardName ?? null;

    // Make sure our local mirror of open orders is current before we try
    // to resolve productId → order_item_id. Without this, the very first
    // scan of the day misses the order link and the Received counter
    // stays at 0 until the next periodic sync.
    await syncOrders().catch(() => {});

    for (const item of items) {
      // Prefer the canonical-product link (set when guard picked from the
      // catalog); fall back to barcode lookup for legacy barcoded items.
      const orderItem = item.productId
        ? await findOpenItemByProductId(item.productId).catch(() => null)
        : await findOpenItemByBarcode(item.barcode).catch(() => null);

      // One receipt per batch so each distinct expiry survives end-to-end
      // (outbox → backend → dashboard → Excel).
      const batches = item.batches.length > 0 ? item.batches : [{ qty: item.qty, expiry: null }];
      for (const batch of batches) {
        const receiptId = `rcp_${nanoid(12)}`;
        await enqueue('receipt', {
          id: receiptId,
          order_id: orderItem?.order_id ?? null,
          order_item_id: orderItem?.id ?? null,
          product_id: item.productId ?? null,
          barcode: item.barcode,
          product_name: item.name,
          qty: batch.qty,
          expiry_date: batch.expiry,
          flagged: false,
          scanned_at: now(),
          performed_by: performedBy,
          performed_by_name: performedByName,
        });

        if (batch.expiry) {
          await trackExpiry({
            barcode: item.barcode,
            productName: item.name,
            expiryDate: batch.expiry,
            qty: batch.qty,
            receiptId,
            performedBy,
            performedByName,
          });
        }
      }

      // Update local order tracking if applicable (once per item — uses summed qty)
      if (orderItem) {
        await addReceivedQty(orderItem.id, item.qty);
      }

      // Barcode learning — remember this real barcode → canonical product
      // so the next scan auto-resolves to the right item without the
      // CatalogPicker. Skip synthetic "catalog_*" barcodes from picks
      // with no physical barcode.
      if (item.productId && !item.barcode.startsWith('catalog_')) {
        await learnBarcode(item.barcode, item.productId, 'scan');
        await enqueue('learn_barcode', {
          barcode: item.barcode,
          product_id: item.productId,
        }).catch(() => {});
      }

      // Roll qty into on-hand stock (once per item — total qty across batches)
      const existing = await findStock(item.barcode);
      if (existing) {
        await adjustOnHand(item.barcode, item.qty);
      } else {
        await upsertStock({
          barcode: item.barcode,
          name: item.name,
          category: item.category,
          unit: item.unit,
          pack_size: item.packSize ?? null,
          on_hand: item.qty,
          threshold: 0,
        });
      }
    }

    // Try to sync immediately, don't block if offline
    flushOnce().catch(() => {});

    // Clear session after successful submission
    setItems([]);
    setLastExpiry(null);
  }, [items]);

  const value = useMemo<OrderSessionCtx>(
    () => ({
      items,
      addItem,
      removeItem,
      updateItemQty,
      clear,
      submitAll,
      isActive: items.length > 0,
      lastExpiry,
    }),
    [items, addItem, removeItem, updateItemQty, clear, submitAll, lastExpiry],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrderSession(): OrderSessionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOrderSession must be inside OrderSessionProvider');
  return ctx;
}
