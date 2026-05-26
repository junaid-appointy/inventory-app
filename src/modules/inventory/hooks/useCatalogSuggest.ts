import Fuse from 'fuse.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KnownProduct, listKnownProducts } from '../../../db/catalog';

const FUSE_OPTIONS: ConstructorParameters<typeof Fuse<KnownProduct>>[1] = {
  keys: ['name'],
  threshold: 0.4, // 0 = exact, 1 = anything. 0.4 is a typo-tolerant sweet spot.
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeScore: true,
};

/**
 * Returns up to `limit` catalog products that fuzzy-match `query`.
 * Catalog is loaded once on first use and re-loaded whenever the
 * returned `reload()` is called (e.g. after a successful registration).
 *
 * Matching tolerates common typos ("watrmilan" → "Watermelon") but
 * cannot translate languages — that's Layer 3's job. If the user's
 * input is Hindi and no Hindi entry exists in the catalog yet, no
 * suggestions will fire.
 */
export function useCatalogSuggest(query: string, limit = 3) {
  const [catalog, setCatalog] = useState<KnownProduct[]>([]);
  const fuseRef = useRef<Fuse<KnownProduct> | null>(null);

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

  useEffect(() => {
    fuseRef.current = new Fuse(catalog, FUSE_OPTIONS);
  }, [catalog]);

  const suggestions = useMemo<KnownProduct[]>(() => {
    const q = query.trim();
    if (q.length < 2 || !fuseRef.current) return [];
    return fuseRef.current.search(q, { limit }).map((r) => r.item);
  }, [query, limit]);

  return { suggestions, reload };
}
