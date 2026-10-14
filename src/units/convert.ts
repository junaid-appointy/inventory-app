/**
 * Unit Conversion & Display — Pure functions for pack ↔ base-unit math
 * and human-readable stock formatting.
 *
 * All quantity storage in the system is pack-denominated (on_hand = number
 * of packs, possibly fractional). These helpers translate between "packs"
 * and "base units" so the UI can display and accept quantities in
 * whichever form is most natural for the guard.
 */

import { resolveUnit, type UnitDef } from './registry';
import { formatAmount } from './amount';

// ─── Rounding ────────────────────────────────────────────────────

/**
 * Round a quantity to a clean precision, killing floating-point dust
 * (0.30000000000000004 → 0.3, 5.1000000000001 → 5.1). Three decimals
 * is the finest granularity the system tracks (the smallest minStep /
 * pack-correction floor is 0.001), so anything below that is noise.
 *
 * Use this on every value produced by pack↔unit conversion or by
 * grid-snapping before it lands in state or on screen — raw float math
 * leaks garbage digits that then get displayed verbatim by the stepper.
 */
export function roundQty(n: number, decimals: number = 3): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

// ─── Conversion ──────────────────────────────────────────────────

/** Convert a pack count to base units.  3 packs × 5 kg/pack = 15 kg. */
export function packToBase(packs: number, packSize: number): number {
  return packs * (packSize > 0 ? packSize : 1);
}

/** Convert base units to fractional packs.  13 l ÷ 5 l/pack = 2.6 packs. */
export function baseToPack(baseUnits: number, packSize: number): number {
  const ps = packSize > 0 ? packSize : 1;
  return baseUnits / ps;
}

// ─── Dispense Mode Resolution ────────────────────────────────────

/**
 * Should the dispense UI show a pack/unit toggle?
 *
 * True when:
 *  - packSize > 1 (there IS a pack to subdivide), AND
 *  - the unit is continuous (kg, l — fractional amounts are meaningful),
 *    OR the unit is discrete but pack_size > 1 (3-bar pack → can take 1 bar)
 *
 * False when:
 *  - packSize ≤ 1 (single item = no subdivision)
 */
export function canSubdivide(
  packSize: number | null | undefined,
  unitSymbol: string | null | undefined,
): boolean {
  const ps = packSize ?? 1;
  if (ps <= 1) return false;
  // Any unit with pack_size > 1 can be subdivided — continuous units
  // allow decimal sub-amounts, discrete units allow integer sub-amounts.
  return true;
}

/**
 * Whether the stepper should allow decimal input for a given mode.
 *
 * - In 'pack' mode: decimal only if the pack-level on_hand can be
 *   fractional (which it can when packs have been partially dispensed).
 *   We allow it to let guards correct fractional counts.
 * - In 'unit' mode: decimal only if the unit is continuous (kg, l).
 */
export function isDecimalMode(
  mode: 'pack' | 'unit',
  unitSymbol: string | null | undefined,
): boolean {
  const def = resolveUnit(unitSymbol);
  if (mode === 'unit') return def.nature === 'continuous';
  // Pack mode: allow decimal because fractional packs exist after
  // partial dispense (e.g. 2.6 cans). Guard can type 0.4.
  return true;
}

/**
 * The step size the +/- buttons should use for a given mode.
 *
 * Pack mode: always 1 (one whole pack per tap).
 * Unit mode: uses the unit registry's minStep (0.1 for kg, 1 for bars).
 */
export function stepSizeFor(
  mode: 'pack' | 'unit',
  unitSymbol: string | null | undefined,
): number {
  if (mode === 'pack') return 1;
  return resolveUnit(unitSymbol).minStep;
}

/**
 * Minimum value for the stepper.
 * Pack mode (continuous): 0 — fractional packs are real, and a clean 0
 *   floor lets the guard dial all the way down without the stepper
 *   snapping to an ugly 0.001. The confirm/save button gates on qty > 0
 *   separately, so 0 is a safe resting value, not a submittable one.
 * Pack mode (discrete): 1 — you can't take half a whole-count pack.
 * Unit mode: the unit's minStep (continuous) or 1 (discrete).
 */
export function minFor(
  mode: 'pack' | 'unit',
  unitSymbol: string | null | undefined,
): number {
  const def = resolveUnit(unitSymbol);
  if (mode === 'unit') return def.nature === 'continuous' ? def.minStep : 1;
  return def.nature === 'continuous' ? 0 : 1;
}

/**
 * Maximum value for the stepper.
 * The available quantity re-expressed in the active mode.
 */
export function maxForMode(
  mode: 'pack' | 'unit',
  availablePacks: number,
  packSize: number | null | undefined,
): number {
  if (mode === 'pack') return availablePacks;
  return packToBase(availablePacks, packSize ?? 1);
}

/**
 * Convert a value from one mode to the other.
 * Used when the guard toggles the pack/unit chip.
 */
export function convertBetweenModes(
  value: number,
  fromMode: 'pack' | 'unit',
  toMode: 'pack' | 'unit',
  packSize: number | null | undefined,
): number {
  if (fromMode === toMode) return value;
  const ps = (packSize ?? 1) > 0 ? (packSize ?? 1) : 1;
  if (fromMode === 'pack' && toMode === 'unit') return packToBase(value, ps);
  return baseToPack(value, ps);
}

// ─── Display Formatting ──────────────────────────────────────────

/**
 * Smart-round a number for display. Avoids ugly floating-point dust
 * (2.600000001 → 2.6) and keeps up to `maxDecimals` significant digits.
 */
function smartRound(n: number, maxDecimals: number = 2): number {
  if (Number.isInteger(n)) return n;
  const factor = Math.pow(10, maxDecimals);
  return Math.round(n * factor) / factor;
}

/**
 * Format a single number for display, trimming trailing zeros.
 * 2.60 → "2.6", 3.0 → "3", 0.333 → "0.33"
 */
function formatNum(n: number): string {
  return String(smartRound(n));
}

/**
 * Human-readable on-hand amount. 'friendly' (the default, every field-app
 * screen) is the spoken form from amount.ts: "9 kg 800 g", "2 packs +
 * 3 pcs", "6 bottles". 'compact' is a bare number for the dashboard.
 */
export function formatOnHand(
  onHand: number,
  packSize: number | null | undefined,
  unit: string | null | undefined,
  style: 'friendly' | 'compact' = 'friendly',
): string {
  // Field-app wording: amounts as people say them (see amount.ts). The
  // compact form is kept for the dashboard's numeric columns.
  if (style === 'friendly') return formatAmount(onHand, packSize, unit);
  const ps = (packSize ?? 1) > 0 ? (packSize ?? 1) : 1;
  const rounded = smartRound(onHand);
  if (ps <= 1) return `${formatNum(rounded)} ${resolveUnit(unit).symbol}`;
  return `${formatNum(rounded)}`;
}

/**
 * Short on-hand label for lists. Same spoken form as formatOnHand: no
 * decimals and never a bare number without its unit.
 */
export function formatOnHandShort(
  onHand: number,
  packSize: number | null | undefined,
  unit: string | null | undefined,
): string {
  return formatAmount(onHand, packSize, unit);
}

/**
 * Pack-size hint for display under the on-hand count.
 * Returns e.g. "× 5 kg" or just "kg" for pack_size=1.
 */
export function packSizeHint(
  packSize: number | null | undefined,
  unit: string | null | undefined,
): string {
  const ps = (packSize ?? 1) > 0 ? (packSize ?? 1) : 1;
  const def = resolveUnit(unit);

  if (ps <= 1) return def.symbol;
  return `× ${formatNum(ps)} ${def.symbol}`;
}

/**
 * Label for the "pack" chip in the dispense toggle.
 * e.g. "pack (5 kg)" or "pack (3 bars)"
 */
export function packChipLabel(
  packSize: number | null | undefined,
  unit: string | null | undefined,
): string {
  const ps = (packSize ?? 1) > 0 ? (packSize ?? 1) : 1;
  const def = resolveUnit(unit);
  return `pack (${formatNum(ps)} ${def.symbol})`;
}

/**
 * Label for the "unit" chip in the dispense toggle.
 * e.g. "litres" or "bars"
 */
export function unitChipLabel(
  unit: string | null | undefined,
): string {
  const def = resolveUnit(unit);
  return def.displayName;
}
