/**
 * The one way to pull stock into the local cache.
 *
 * Stock levels and their per-expiry lots are a single fact — `on_hand`
 * is literally the sum of the lots. Pulling one without the other
 * leaves the device holding a count with no batches behind it, and
 * EditStock treats "no batches" as "this product has no expiry", so a
 * correction saved from that state writes a null-expiry lot over the
 * real dated ones and destroys the expiry server-side.
 *
 * Three of the five stock-pull call sites (login warm-up, Home, Alerts)
 * used to sync levels only, which made that reachable in a few taps
 * from a cold start. Everything goes through here now.
 */

import { pruneLotsToBarcodes, replaceLotsLocal } from '../db/lots';
import { remoteStockToLocal, replaceStockFromRemote } from '../db/stock';
import { api } from './api';

/**
 * Fetch `/api/inventory/stock` and replace the local levels + lots.
 * Throws on failure so callers can drive their own cache-state machine.
 */
export async function pullStockIntoCache(): Promise<void> {
  const remote = await api.fetch.stock();
  await replaceStockFromRemote(remote.map(remoteStockToLocal));
  // Mirror per-barcode lots too. An empty array clears the local lots
  // for that barcode — matches the server having no batches.
  for (const r of remote) {
    await replaceLotsLocal(
      r.barcode,
      (r.lots ?? []).map((l) => ({
        expiry_date: l.expiry_date,
        qty: Number(l.qty),
      })),
    );
  }
  await pruneLotsToBarcodes(remote.map((r) => r.barcode));
}
