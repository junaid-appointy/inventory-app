/**
 * Unit Registry — Built-in unit definitions for the inventory system.
 *
 * Every unit the system knows about is described by a `UnitDef`. The
 * registry drives the dispense UI (integer vs decimal stepper, pack vs
 * base-unit toggle) and stock display formatting — replacing the old
 * per-product `dispense_mode` toggle.
 *
 * The built-in set covers 95%+ of real-world office inventory. Unknown
 * unit symbols fall back to a generic discrete entry so the system never
 * crashes on unrecognised units.
 */

// ─── Types ────────────────────────────────────────────────────────

/** Whether quantities are whole numbers or fractional. */
export type UnitNature = 'continuous' | 'discrete';

/** Broad physical family — used for grouping, not logic. */
export type UnitFamily = 'weight' | 'volume' | 'count' | 'length';

export type UnitDef = {
  /** Canonical symbol stored in the DB (e.g. 'kg', 'l', 'pcs'). */
  symbol: string;
  family: UnitFamily;
  /**
   * `continuous` — fractional amounts are meaningful (kg, l, ml).
   * `discrete`   — whole numbers only (pcs, bars, sheets).
   */
  nature: UnitNature;
  /** Smallest practical step for the stepper UI. */
  minStep: number;
  /**
   * Sub-unit for natural conversion display: kg→g, l→ml.
   * `factor` is how many sub-units fit in one unit (1 kg = 1000 g).
   * Undefined when no meaningful sub-unit exists.
   */
  subUnit?: { symbol: string; factor: number };
  /** Human-readable name for UI labels. */
  displayName: string;
};

// ─── Built-in Registry ───────────────────────────────────────────

const BUILTIN_UNITS: readonly UnitDef[] = [
  // Weight
  { symbol: 'kg',      family: 'weight', nature: 'continuous', minStep: 0.1,  subUnit: { symbol: 'g', factor: 1000 },   displayName: 'kg' },
  { symbol: 'g',       family: 'weight', nature: 'continuous', minStep: 1,    displayName: 'g' },

  // Volume
  { symbol: 'l',       family: 'volume', nature: 'continuous', minStep: 0.1,  subUnit: { symbol: 'ml', factor: 1000 },  displayName: 'litre' },
  { symbol: 'ml',      family: 'volume', nature: 'continuous', minStep: 1,    displayName: 'ml' },

  // Count / discrete
  { symbol: 'pcs',     family: 'count',  nature: 'discrete',   minStep: 1,    displayName: 'pieces' },
  { symbol: 'pack',    family: 'count',  nature: 'discrete',   minStep: 1,    displayName: 'pack' },
  { symbol: 'sheets',  family: 'count',  nature: 'discrete',   minStep: 1,    displayName: 'sheets' },
  { symbol: 'bars',    family: 'count',  nature: 'discrete',   minStep: 1,    displayName: 'bars' },
  { symbol: 'bottle',  family: 'count',  nature: 'discrete',   minStep: 1,    displayName: 'bottle' },
  { symbol: 'box',     family: 'count',  nature: 'discrete',   minStep: 1,    displayName: 'box' },
  { symbol: 'roll',    family: 'count',  nature: 'discrete',   minStep: 1,    displayName: 'roll' },
  { symbol: 'pair',    family: 'count',  nature: 'discrete',   minStep: 1,    displayName: 'pair' },
  { symbol: 'can',     family: 'count',  nature: 'discrete',   minStep: 1,    displayName: 'can' },
  { symbol: 'bag',     family: 'count',  nature: 'discrete',   minStep: 1,    displayName: 'bag' },
  { symbol: 'tube',    family: 'count',  nature: 'discrete',   minStep: 1,    displayName: 'tube' },
  { symbol: 'set',     family: 'count',  nature: 'discrete',   minStep: 1,    displayName: 'set' },

  // Length
  { symbol: 'm',       family: 'length', nature: 'continuous', minStep: 0.1,  subUnit: { symbol: 'cm', factor: 100 },   displayName: 'metre' },
  { symbol: 'cm',      family: 'length', nature: 'continuous', minStep: 1,    displayName: 'cm' },
] as const;

/** Fast lookup index built once at module load. Case-insensitive. */
const INDEX = new Map<string, UnitDef>();
for (const u of BUILTIN_UNITS) {
  INDEX.set(u.symbol.toLowerCase(), u);
}

/**
 * Fallback for unknown unit symbols — treated as discrete / integer to
 * be safe. The stepper won't offer decimal input for units we don't
 * recognise, which prevents confusing fractions for made-up units.
 */
function fallbackUnit(symbol: string): UnitDef {
  return {
    symbol,
    family: 'count',
    nature: 'discrete',
    minStep: 1,
    displayName: symbol,
  };
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Look up a unit definition by its symbol. Case-insensitive.
 * Returns a safe fallback for unknown symbols — never null.
 */
export function resolveUnit(symbol: string | null | undefined): UnitDef {
  if (!symbol) return fallbackUnit('pcs');
  return INDEX.get(symbol.toLowerCase()) ?? fallbackUnit(symbol);
}

/** Check whether a unit symbol is known in the registry. */
export function isKnownUnit(symbol: string): boolean {
  return INDEX.has(symbol.toLowerCase());
}

/** All built-in unit definitions. Useful for admin UI dropdowns. */
export function allUnits(): readonly UnitDef[] {
  return BUILTIN_UNITS;
}
