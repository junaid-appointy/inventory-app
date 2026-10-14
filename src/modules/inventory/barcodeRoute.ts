/**
 * Where a scanned product barcode should go: Receiving when we know the
 * product (local catalog, legacy local table, then the server), otherwise
 * the registration form. Shared by inventory's scanner and the app-wide
 * Scan button so both decide the same way.
 */
import { findCanonicalProductByBarcode, learnBarcode } from '../../db/catalog';
import { findProduct, upsertProduct } from '../../db/products';
import type { RootStackParamList } from '../../navigation/types';
import { api } from '../../sync/api';

/** Product barcodes are 1D. QR stays out (it belongs to visitor passes). */
export const PRODUCT_CODE_TYPES = [
  'code-128',
  'code-39',
  'code-93',
  'codabar',
  'ean-13',
  'ean-8',
  'itf',
  'upc-a',
  'upc-e',
] as const;

export type BarcodeRoute =
  | { name: 'Receiving'; params: RootStackParamList['Receiving'] }
  | { name: 'RegisterProduct'; params: RootStackParamList['RegisterProduct'] };

export async function resolveBarcodeRoute(raw: string): Promise<BarcodeRoute> {
  // First check: canonical product catalog (barcode → product_id)
  const canonical = await findCanonicalProductByBarcode(raw).catch(() => null);
  if (canonical) {
    return {
      name: 'Receiving',
      params: {
        barcode: raw,
        productId: canonical.product_id,
        productName: canonical.canonical_name,
        unit: canonical.unit,
        packSize: canonical.pack_size,
      },
    };
  }

  // Second check: legacy local products table
  const local = await findProduct(raw).catch(() => null);
  if (local) {
    return { name: 'Receiving', params: { barcode: raw, packSize: local.pack_size ?? undefined } };
  }

  // Third check: backend catalog
  try {
    const hit = await api.fetch.catalog(raw);
    if (hit.product) {
      await upsertProduct({
        barcode: hit.product.barcode,
        name: hit.product.name,
        category: hit.product.category,
        unit: hit.product.unit,
        pack_size: hit.product.pack_size ?? null,
      });
      const productId = hit.product.product_id;
      if (productId) {
        // Remember the mapping so the next scan resolves offline.
        await learnBarcode(raw, productId, 'server').catch(() => {});
        return {
          name: 'Receiving',
          params: {
            barcode: raw,
            productId,
            productName: hit.product.name,
            unit: hit.product.unit ?? undefined,
            packSize: hit.product.pack_size ?? undefined,
          },
        };
      }
      return { name: 'Receiving', params: { barcode: raw, packSize: hit.product.pack_size ?? undefined } };
    }
  } catch {
    // Offline / 401 — fall through.
  }

  // Not in any catalog: the registration form, where the catalog list is
  // offered as suggestions on the name field.
  return { name: 'RegisterProduct', params: { barcode: raw } };
}
