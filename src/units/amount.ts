/**
 * Amounts the way people say them.
 *
 * Storage stays pack-denominated (on_hand = packs, possibly fractional:
 * 1.96 bags of sugar). People never see that. Every product has a shape,
 * worked out from its pack size and unit, and the screens talk in the
 * shape's natural small unit:
 *
 *   single       one thing per pack (bottle, stapler)      → "6 pcs"
 *   countPack    a pack of countable things (box of 12)    → "2 packs + 3 pcs"
 *   measurePack  a pack of weighable/pourable stuff (5 kg) → "9 kg 800 g"
 *
 * No decimals reach the operator: 200 g, never 0.2 kg or 0.04 packs.
 */
import { resolveUnit } from './registry';

export type ProductShape = 'single' | 'countPack' | 'measurePack';

/** Count words that take a plural: "1 bottle", "6 bottles", "2 boxes". */
const PLURALS: Record<string, string> = {
  bottle: 'bottles', box: 'boxes', roll: 'rolls', pair: 'pairs', can: 'cans',
  bag: 'bags', tube: 'tubes', set: 'sets', pack: 'packs',
};
function countWord(symbol: string, n: number): string {
  return n === 1 ? symbol : PLURALS[symbol] ?? symbol;
}

function packSizeOf(packSize: number | null | undefined): number {
  return packSize != null && packSize > 0 ? packSize : 1;
}

export function productShape(packSize: number | null | undefined, unit: string | null | undefined): ProductShape {
  const ps = packSizeOf(packSize);
  // Weight and volume can always be taken part-way, even from a 1 kg pack.
  if (resolveUnit(unit).nature === 'continuous') return 'measurePack';
  return ps > 1 ? 'countPack' : 'single';
}

/**
 * The unit people take amounts in, and how many of it make one base unit:
 * kg → g (1000), l → ml (1000), m → cm (100). Pieces and grams stay as is.
 */
export function smallUnit(unit: string | null | undefined): { symbol: string; perBase: number } {
  const def = resolveUnit(unit);
  return def.subUnit ? { symbol: def.subUnit.symbol, perBase: def.subUnit.factor } : { symbol: def.symbol, perBase: 1 };
}

/** How many small units are in one pack: 5 kg bag → 5000 (g); box of 12 → 12 (pcs). */
export function smallPerPack(packSize: number | null | undefined, unit: string | null | undefined): number {
  return packSizeOf(packSize) * smallUnit(unit).perBase;
}

export function packsToSmall(packs: number, packSize: number | null | undefined, unit: string | null | undefined): number {
  return Math.round(packs * smallPerPack(packSize, unit));
}

export function smallToPacks(small: number, packSize: number | null | undefined, unit: string | null | undefined): number {
  return small / smallPerPack(packSize, unit);
}

/** "9 kg 800 g", "800 g", "2 kg"; or "350 g" when there is no bigger unit. */
export function formatSmall(small: number, unit: string | null | undefined): string {
  const def = resolveUnit(unit);
  const { symbol, perBase } = smallUnit(unit);
  const n = Math.max(0, Math.round(small));
  if (perBase === 1) return `${n} ${symbol}`.trim();
  const big = Math.floor(n / perBase);
  const rest = n - big * perBase;
  if (big === 0) return `${rest} ${symbol}`;
  if (rest === 0) return `${big} ${def.symbol}`;
  return `${big} ${def.symbol} ${rest} ${symbol}`;
}

/** Any stored amount (in packs) written the way people say it. */
export function formatAmount(packs: number, packSize: number | null | undefined, unit: string | null | undefined): string {
  const def = resolveUnit(unit);
  const ps = packSizeOf(packSize);
  const shape = productShape(packSize, unit);
  if (shape === 'measurePack') return formatSmall(packsToSmall(packs, packSize, unit), unit);
  if (shape === 'single') {
    const n = Math.round(packs * 100) / 100;
    return `${n} ${countWord(def.symbol, n)}`.trim();
  }
  // countPack: whole packs plus loose pieces from the open one.
  const pieces = Math.max(0, Math.round(packs * ps));
  const whole = Math.floor(pieces / ps);
  const rest = pieces - whole * ps;
  const packsText = `${whole} ${countWord('pack', whole)}`;
  if (whole === 0) return `${rest} ${countWord(def.symbol, rest)}`;
  if (rest === 0) return packsText;
  return `${packsText} + ${rest} ${countWord(def.symbol, rest)}`;
}

/** Nearest "nice" number: 1, 2, 2.5 or 5 times a power of ten. */
function nice(x: number): number {
  if (x <= 0) return 0;
  const pow = Math.pow(10, Math.floor(Math.log10(x)));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * pow);
  return candidates.reduce((best, c) => (Math.abs(Math.log(c / x)) < Math.abs(Math.log(best / x)) ? c : best), candidates[0]);
}

/**
 * One-tap amounts, made from the pack automatically (user decision): a
 * 5 kg bag offers 250 g, 500 g, 1 kg, 2 kg 500 g; a 1 l bottle 50, 100,
 * 200, 500 ml; a box of 12 offers 1, 2, 5, 6 pieces. In small units.
 */
export function quickAmounts(packSize: number | null | undefined, unit: string | null | undefined): number[] {
  const shape = productShape(packSize, unit);
  const perPack = smallPerPack(packSize, unit);
  const raw =
    shape === 'countPack'
      ? [1, 2, 5, Math.floor(perPack / 2)]
      : [0.05, 0.1, 0.2, 0.5].map((f) => Math.round(nice(perPack * f)));
  return Array.from(new Set(raw.filter((v) => v > 0 && v < perPack))).sort((a, b) => a - b);
}

/** What one tap of − or + moves, in small units: about 1% of a pack, made nice (5 kg → 50 g). */
export function smallStep(packSize: number | null | undefined, unit: string | null | undefined): number {
  if (productShape(packSize, unit) !== 'measurePack') return 1;
  return Math.max(1, Math.round(nice(smallPerPack(packSize, unit) * 0.01)));
}
