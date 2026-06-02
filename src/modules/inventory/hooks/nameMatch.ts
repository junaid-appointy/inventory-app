// Client-side fuzzy name matcher.
// Cheap (no network), fast (microseconds), works offline, tolerates
// Devanagari input + Latin sound-alikes / typos. Pure JS — RN-safe.
//
// Pipeline per candidate name:
//   1. Lowercase + strip diacritics + transliterate any Devanagari
//      to Latin (so "घी" becomes "ghi").
//   2. Compute a Soundex-style phonetic key (so "Ghee" and "Ghi"
//      collapse to the same key).
//   3. Score: phonetic key match, substring / prefix match, then
//      Levenshtein distance on the transliterated form as a fallback.
//
// Bundle cost: ~2KB minified, zero deps.

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
  // matras
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
  return transliterate(input)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '');
}

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
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  const curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
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
  tokens: string[];
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
    };
  });
}

export interface ScoredMatch<T> {
  item: T;
  score: number;
}

export function rankByName<T>(
  index: NameIndexEntry<T>[],
  query: string,
  limit = 5,
): ScoredMatch<T>[] {
  const q = normalize(query);
  if (!q) return [];
  const qPhonetic = phoneticKey(query);
  const qTokens = query.split(/\s+/).map(normalize).filter(Boolean);

  const scored: ScoredMatch<T>[] = [];
  for (const entry of index) {
    if (!entry.normalized) continue;

    let best = Infinity;
    if (entry.normalized === q) best = 0;
    else if (entry.normalized.startsWith(q)) best = 1;
    else if (entry.normalized.includes(q)) best = 2;

    for (const tok of entry.tokens) {
      if (tok === q) best = Math.min(best, 0);
      else if (tok.startsWith(q)) best = Math.min(best, 1);
    }

    if (qPhonetic && entry.phonetic === qPhonetic) {
      best = Math.min(best, 3);
    }
    for (const tok of entry.tokens) {
      if (phoneticKey(tok) === qPhonetic) {
        best = Math.min(best, 3);
      }
    }

    if (qTokens.length > 1) {
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

    const dist = levenshtein(q, entry.normalized);
    const lenMax = Math.max(q.length, entry.normalized.length);
    if (dist <= Math.max(2, Math.ceil(lenMax * 0.3))) {
      best = Math.min(best, 5 + dist);
    }

    if (best !== Infinity) {
      scored.push({ item: entry.item, score: best });
    }
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit);
}
