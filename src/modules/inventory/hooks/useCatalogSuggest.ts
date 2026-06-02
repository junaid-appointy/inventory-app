import { useEffect, useMemo, useState } from 'react';
import { KnownProduct, listKnownProducts } from '../../../db/catalog';
import { buildNameIndex, rankByName, type NameIndexEntry } from './nameMatch';

/**
 * Returns up to `limit` catalog products that fuzzy-match `query`.
 * Catalog is loaded once on first use and re-loaded whenever the
 * returned `reload()` is called (e.g. after a successful registration).
 *
 * Matching layers (cheapest first, all client-side):
 *   - normalized substring / prefix match
 *   - Soundex-style phonetic key match (so "ghee" finds "ghi", and
 *     a Hindi input like "घी" — transliterated to "ghi" — also hits)
 *   - Levenshtein distance fallback for typos ("watrmilan" → "Watermelon")
 *
 * Zero network calls, no extra deps.
 */
export function useCatalogSuggest(query: string, limit = 3) {
  const [catalog, setCatalog] = useState<KnownProduct[]>([]);

  const reload = useMemo(
    () => async () => {
      const rows = await listKnownProducts();
      setCatalog(rows);
    },
    [],
  );

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  const index = useMemo<NameIndexEntry<KnownProduct>[]>(
    () => buildNameIndex(catalog, (p) => p.name ?? ''),
    [catalog],
  );

  const suggestions = useMemo<KnownProduct[]>(() => {
    const q = query.trim();
    if (q.length < 2 || index.length === 0) return [];
    return rankByName(index, q, limit).map((r) => r.item);
  }, [index, query, limit]);

  return { suggestions, reload };
}
