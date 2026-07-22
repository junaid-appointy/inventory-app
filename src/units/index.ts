/**
 * Units module — barrel export.
 *
 * Centralises the unit registry (definitions) and conversion/formatting
 * helpers so consumers import from `../units` rather than reaching into
 * individual files.
 */

export { resolveUnit, isKnownUnit, allUnits } from './registry';
export type { UnitDef, UnitNature, UnitFamily } from './registry';

export {
  // Rounding
  roundQty,
  // Conversion
  packToBase,
  baseToPack,
  convertBetweenModes,
  // Mode resolution
  canSubdivide,
  isDecimalMode,
  stepSizeFor,
  minFor,
  maxForMode,
  // Display formatting
  formatOnHand,
  formatOnHandShort,
  packSizeHint,
  packChipLabel,
  unitChipLabel,
} from './convert';
