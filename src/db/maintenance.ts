import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDb } from './database';

const FLAG = 'app.cache.resetv1';

/**
 * One-time wipe of the local read-cache tables.
 *
 * Earlier builds seeded eight demo `stock_levels` rows on first launch.
 * Now that the field-app reads from the office-ops backend, that seed
 * leaks through as "dummy data". This clears the offline read-cache so
 * the device hydrates fresh from the server on next focus.
 *
 * What we DO clear: stock_levels, orders, order_items — pure read
 * caches that are re-mirrored from remote on screen focus.
 *
 * What we DO NOT clear:
 *   - products: catalog mappings the guard registered locally (used by
 *     Scanner before a remote lookup).
 *   - outbox: pending writes destined for the backend.
 *   - receipts: local record of what was scanned at the gate.
 *
 * Gated by an AsyncStorage flag so this only runs once per install.
 * Bump the flag suffix if a future reset is needed.
 */
export async function resetLocalCacheOnce(): Promise<void> {
  const done = await AsyncStorage.getItem(FLAG);
  if (done) return;
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM stock_levels;
    DELETE FROM order_items;
    DELETE FROM orders;
  `);
  await AsyncStorage.setItem(FLAG, '1');
}
