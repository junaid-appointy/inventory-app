// Fuzzy name matcher, the same one the guard web app (visitor-web) uses.
// Goals: cheap (no network), fast (microseconds), works offline,
// tolerates Devanagari input + Latin sound-alikes / typos.
//
// Pipeline per candidate name:
//   1. Lowercase + strip diacritics + transliterate any Devanagari
//      to Latin (so "जुनैद" becomes "junaid").
//   2. Compute a Soundex-style phonetic key (so "Juneyd" and "Junaid"
//      collapse to the same key).
//   3. Score: phonetic key match (cheap & strong), substring match,
//      Levenshtein distance on the transliterated form.
//
// Bundle cost: ~2KB minified, zero deps.

// Devanagari → Latin transliteration table. Covers the consonants,
// vowels, matras and modifiers commonly seen in Indian names. Anything
// outside this set is passed through unchanged so Latin input is a no-op.
const DEVANAGARI_MAP: Record<string, string> = {
  // independent vowels
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ii', 'उ': 'u', 'ऊ': 'uu',
  'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
  // consonants
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
  // matras (dependent vowel signs)
  'ा': 'a', 'ि': 'i', 'ी': 'ii', 'ु': 'u', 'ू': 'uu',
  'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
  // modifiers
  'ं': 'n', 'ः': 'h', 'ँ': 'n',
  '्': '', // virama suppresses the implicit 'a'
  '़': '', // nukta — ignore for matching
};

function transliterate(input: string): string {
  let out = '';
  for (const ch of input) {
    out += DEVANAGARI_MAP[ch] ?? ch;
  }
  return out;
}

function normalize(input: string): string {
  // strip combining diacritics (NFD then drop \p{Mn})
  return transliterate(input)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '');
}

// Soundex-style key: first letter + 3 consonant-class digits.
// Maps phonetically similar consonants to the same digit, so e.g.
// "Junaid" and "Juneyd" both reduce to "J530".
const SOUNDEX_CODE: Record<string, string> = {
  b: '1', f: '1', p: '1', v: '1',
  c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2',
  d: '3', t: '3',
  l: '4',
  m: '5', n: '5',
  r: '6',
};

function phoneticKey(input: string): string {
  const norm = normalize(input);
  if (!norm) return '';
  const first = norm[0];
  let key = first.toUpperCase();
  let lastCode = SOUNDEX_CODE[first] ?? '';
  for (let i = 1; i < norm.length && key.length < 4; i++) {
    const code = SOUNDEX_CODE[norm[i]] ?? '';
    if (!code || code === lastCode) {
      // skip vowels/h/w/y and avoid repeating the same class
      if (!code) lastCode = '';
      continue;
    }
    key += code;
    lastCode = code;
  }
  return key.padEnd(4, '0');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  // rolling 1D array
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  const curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // insertion
        prev[j] + 1,            // deletion
        prev[j - 1] + cost,     // substitution
      );
    }
    prev = curr.slice();
  }
  return prev[b.length];
}

export interface NameIndexEntry<T> {
  item: T;
  normalized: string;
  phonetic: string;
  tokens: string[]; // per-word normalized tokens (e.g. ["junaid","khan"])
  tokenPhonetics: string[]; // phonetic key per token, precomputed once
}

export function buildNameIndex<T>(items: T[], getName: (item: T) => string): NameIndexEntry<T>[] {
  return items.map((item) => {
    const name = getName(item) ?? '';
    const normalized = normalize(name);
    const tokens = name
      .split(/\s+/)
      .map(normalize)
      .filter(Boolean);
    return {
      item,
      normalized,
      phonetic: phoneticKey(name),
      tokens,
      // Precompute per-token phonetic keys at index-build time so the hot
      // ranking loop never recomputes a Soundex key per keystroke.
      tokenPhonetics: tokens.map((t) => phoneticKey(t)),
    };
  });
}

export interface ScoredMatch<T> {
  item: T;
  score: number;
}

// Returns the top-N items ranked by similarity to the query.
// Lower score = better. Returns empty list if query is empty.
//
// Scoring tiers (lower wins): exact/token-exact 0, prefix 1, substring 2,
// phonetic 3, multi-token 4+, Levenshtein fallback 5+. Because the tiers are
// ordered, once a candidate has a cheap match we can SKIP the expensive
// phonetic / multi-token / Levenshtein passes — they could only ever produce
// a worse (higher) score. This short-circuit is what keeps typing responsive
// on a few-hundred-row directory on a low-end phone.
export function rankByName<T>(
  index: NameIndexEntry<T>[],
  query: string,
  limit = 5,
): ScoredMatch<T>[] {
  const q = normalize(query);
  if (!q) return [];
  const qPhonetic = phoneticKey(query);
  const qTokens = query.split(/\s+/).map(normalize).filter(Boolean);
  const multiToken = qTokens.length > 1;

  const scored: ScoredMatch<T>[] = [];
  for (const entry of index) {
    if (!entry.normalized) continue;

    // exact / prefix match on the whole name → strongest
    let best = Infinity;
    if (entry.normalized === q) best = 0;
    else if (entry.normalized.startsWith(q)) best = 1;
    else if (entry.normalized.includes(q)) best = 2;

    // per-token prefix match (handles multi-word names: "khan" → "junaid khan")
    if (best > 0) {
      for (const tok of entry.tokens) {
        if (tok === q) { best = 0; break; }
        if (best > 1 && tok.startsWith(q)) best = 1;
      }
    }

    // phonetic key match → strong signal for sound-alikes / typos.
    // Only worthwhile if nothing better than tier 3 was found.
    if (best > 3 && qPhonetic) {
      if (entry.phonetic === qPhonetic) best = 3;
      else {
        for (const tp of entry.tokenPhonetics) {
          if (tp === qPhonetic) { best = 3; break; }
        }
      }
    }

    // multi-token query: sum of best-per-token edit distance. Tier 4+, so
    // only run when we don't already have a tier ≤4 hit.
    if (multiToken && best > 4) {
      let sum = 0;
      for (const qt of qTokens) {
        let local = Infinity;
        for (const et of entry.tokens) {
          local = Math.min(local, levenshtein(qt, et));
        }
        if (local === Infinity) local = qt.length;
        sum += local;
      }
      best = Math.min(best, 4 + sum);
    }

    // Levenshtein fallback (tier 5+) — the most expensive pass, so it runs
    // last and only when no cheaper tier matched.
    if (best > 5) {
      const lenMax = Math.max(q.length, entry.normalized.length);
      const maxDist = Math.max(2, Math.ceil(lenMax * 0.3));
      // Length difference is a lower bound on edit distance — skip the full
      // DP when the words are too different in length to ever qualify.
      if (Math.abs(q.length - entry.normalized.length) <= maxDist) {
        const dist = levenshtein(q, entry.normalized);
        if (dist <= maxDist) best = Math.min(best, 5 + dist);
      }
    }

    if (best !== Infinity) {
      scored.push({ item: entry.item, score: best });
    }
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit);
}

/**
 * Rank items that can be found by several names (a visit by its visitor or
 * its host). Each item keeps its best score. Cheap enough to rebuild per
 * keystroke for a gate's list of visits; for the staff directory, build the
 * index once with buildNameIndex instead.
 */
export function rankByAnyName<T>(items: T[], getNames: (item: T) => Array<string | null | undefined>, query: string, limit = 50): T[] {
  const pairs: Array<{ item: T; name: string }> = [];
  for (const item of items) {
    for (const name of getNames(item)) if (name) pairs.push({ item, name });
  }
  const best = new Map<T, number>();
  for (const m of rankByName(buildNameIndex(pairs, (p) => p.name), query, pairs.length)) {
    const prev = best.get(m.item.item);
    if (prev === undefined || m.score < prev) best.set(m.item.item, m.score);
  }
  return [...best.entries()].sort((a, b) => a[1] - b[1]).slice(0, limit).map(([item]) => item);
}
