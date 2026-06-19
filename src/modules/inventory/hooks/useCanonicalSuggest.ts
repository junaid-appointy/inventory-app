import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { CanonicalProduct, listCanonicalProducts } from '../../../db/catalog';

/** Dice (bigram) similarity — surfaces a single "did you mean…" pick
 *  when nothing matches as a substring. */
function similarity(a: string, b: string): number {
  const la = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const lb = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (la === lb) return 1;
  if (la.length < 2 || lb.length < 2) return 0;
  const bg = (s: string) => {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  };
  const A = bg(la);
  const B = bg(lb);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size);
}

/**
 * Returns substring/prefix matches against the admin-curated canonical
 * catalog, plus a single closest fuzzy match for typo correction.
 *
 *  - `matches`    — ranked exact/prefix/substring hits (for the dropdown)
 *  - `suggestion` — best Dice-similarity hit (≥ 0.35) ONLY when there
 *                   are no substring matches, for the "Did you mean…" pill
 *  - `catalog`    — the full local cache, exposed so the caller can show
 *                   "N items in catalog" diagnostics
 *  - `reload()`   — re-reads from SQLite (call after a sync)
 *
 * Options:
 *  - `excludeMapped` — drop products that already have a barcode mapped
 *    on the server. Used by RegisterProduct + CatalogPicker when a new
 *    physical barcode is being registered, to enforce the
 *    one-barcode-per-product rule.
 */
export function useCanonicalSuggest(
  query: string,
  opts: { excludeMapped?: boolean } = {},
) {
  const { excludeMapped = false } = opts;
  const [catalog, setCatalog] = useState<CanonicalProduct[]>([]);

  const reload = useMemo(
    () => async () => {
      const rows = await listCanonicalProducts();
      setCatalog(rows);
    },
    [],
  );

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  // Defer the scoring/sorting off the keystroke so the input stays smooth
  // while typing against a large canonical catalog.
  const deferredQuery = useDeferredValue(query);
  const { matches, suggestion } = useMemo(() => {
    const pool = excludeMapped ? catalog.filter((p) => !p.has_barcode) : catalog;
    const q = deferredQuery.trim().toLowerCase();
    if (!q) {
      return {
        matches: [...pool].sort((a, b) => a.canonical_name.localeCompare(b.canonical_name)),
        suggestion: null as CanonicalProduct | null,
      };
    }

    type Scored = { p: CanonicalProduct; score: number };
    const scored: Scored[] = pool.map((p) => {
      const name = p.canonical_name.toLowerCase();
      let score = 0;
      if (name === q) score = 3;
      else if (name.startsWith(q)) score = 2;
      else if (name.includes(q)) score = 1;
      else if ((p.category ?? '').toLowerCase().includes(q)) score = 0.5;
      else if ((p.hsn_code ?? '').toLowerCase().includes(q)) score = 0.5;
      return { p, score };
    });
    const hits = scored
      .filter((x) => x.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.p.canonical_name.localeCompare(b.p.canonical_name);
      })
      .map((x) => x.p);

    let bestSuggestion: CanonicalProduct | null = null;
    if (hits.length === 0) {
      let best: CanonicalProduct | null = null;
      let bestScore = 0;
      for (const p of pool) {
        const s = similarity(query, p.canonical_name);
        if (s > bestScore) { bestScore = s; best = p; }
      }
      if (best && bestScore >= 0.35) bestSuggestion = best;
    }

    return { matches: hits, suggestion: bestSuggestion };
  }, [catalog, deferredQuery, excludeMapped]);

  // True while the deferred match is still catching up to the latest input.
  const searching = query.trim().length > 0 && query !== deferredQuery;

  return { matches, suggestion, catalog, searching, reload };
}
