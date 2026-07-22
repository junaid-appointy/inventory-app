/**
 * UnitAwareStepper — A quantity picker that knows about packs and
 * base units. Wraps the existing QtyStepper and adds a chip toggle
 * so the guard can pick "packs" or "litres" (or "bars", etc.)
 * naturally, without any admin pre-configuration.
 *
 * Replaces the raw QtyStepper + `dispense_mode === 'divisible'`
 * checks on DispenseScreen.
 *
 * If the product can't be subdivided (pack_size ≤ 1), this renders
 * a plain QtyStepper with no chips — same UX as today but with the
 * decimal/integer decision driven by the unit registry instead of a
 * per-product flag.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip } from './Chip';
import { QtyStepper } from './QtyStepper';
import { Text } from './Text';
import { spacing } from './tokens';
import { useTheme } from '../theme';
import {
  canSubdivide,
  convertBetweenModes,
  isDecimalMode,
  maxForMode,
  minFor,
  packChipLabel,
  resolveUnit,
  roundQty,
  stepSizeFor,
  unitChipLabel,
} from '../units';

export type DispenseMode = 'pack' | 'unit';

type Props = {
  /** Current quantity value — denomination depends on `mode`. */
  value: number;
  /**
   * Called when the guard changes qty or toggles the pack/unit chip.
   * `mode` tells you how to interpret `value`:
   *   - 'pack' → value is in packs (possibly fractional)
   *   - 'unit' → value is in base units (kg, litres, bars, etc.)
   */
  onChange: (value: number, mode: DispenseMode) => void;
  /** Product's pack size (e.g. 5 for a 5 kg bag). */
  packSize: number | null | undefined;
  /** Product's unit symbol (e.g. 'kg', 'l', 'pcs'). */
  unit: string | null | undefined;
  /** Max available in packs. Stepper max adapts to the active mode. */
  maxPacks: number;
  /** Current active mode. Parent owns this so it survives re-renders. */
  mode: DispenseMode;
  /** Called when the guard toggles the pack/unit chip. */
  onModeChange: (mode: DispenseMode) => void;
};

export function UnitAwareStepper({
  value,
  onChange,
  packSize,
  unit,
  maxPacks,
  mode,
  onModeChange,
}: Props) {
  const { palette } = useTheme();
  const ps = (packSize ?? 1) > 0 ? (packSize ?? 1) : 1;
  const unitDef = useMemo(() => resolveUnit(unit), [unit]);
  const showChips = canSubdivide(ps, unit);

  // ─── Mode switch handler ─────────────────────────────────────
  const switchMode = useCallback(
    (toMode: DispenseMode) => {
      if (toMode === mode) return;
      // Convert the current value to the new mode so the guard sees
      // the equivalent amount, not a jarring jump.
      const converted = convertBetweenModes(value, mode, toMode, ps);
      // Snap to the nearest valid step to avoid awkward decimals.
      // roundQty strips the float dust that `x / step * step` leaves
      // behind (e.g. 0.30000000000000004) before it reaches state.
      const step = stepSizeFor(toMode, unit);
      const snapped = roundQty(Math.max(step, Math.round(converted / step) * step));
      // Clamp to max.
      const max = maxForMode(toMode, maxPacks, ps);
      const clamped = Math.min(snapped, max);
      onModeChange(toMode);
      onChange(clamped, toMode);
    },
    [mode, value, ps, unit, maxPacks, onModeChange, onChange],
  );

  // ─── Stepper props for the current mode ──────────────────────
  const decimal = isDecimalMode(mode, unit);
  const min = minFor(mode, unit);
  const max = maxForMode(mode, maxPacks, ps);
  const step = stepSizeFor(mode, unit);

  const onQtyChange = useCallback(
    (n: number) => onChange(n, mode),
    [onChange, mode],
  );

  // ─── No subdivision possible — plain stepper ─────────────────
  if (!showChips) {
    return (
      <View style={styles.container}>
        <QtyStepper
          value={value}
          onChange={onQtyChange}
          min={min}
          max={max || undefined}
          decimal={decimal}
          step={step}
        />
      </View>
    );
  }

  // ─── Full mode: chips + stepper ──────────────────────────────
  const pLabel = packChipLabel(ps, unit);
  const uLabel = unitChipLabel(unit);

  return (
    <View style={styles.container}>
      {/* Pack / Unit toggle chips */}
      <View style={styles.chipRow}>
        <Chip
          label={pLabel}
          selected={mode === 'pack'}
          onPress={() => switchMode('pack')}
        />
        <Chip
          label={uLabel}
          selected={mode === 'unit'}
          onPress={() => switchMode('unit')}
        />
      </View>

      {/* The stepper itself — adapts to the active mode */}
      <QtyStepper
        value={value}
        onChange={onQtyChange}
        min={min}
        max={max || undefined}
        decimal={decimal}
        step={step}
      />

      {/* Contextual hint below the stepper */}
      <Text
        variant="labelMedium"
        color={palette.onSurfaceVariant}
        style={styles.hint}
      >
        {mode === 'pack'
          ? `1 pack = ${ps} ${unitDef.symbol}`
          : `${unitDef.symbol} · step ${step}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  hint: {
    textAlign: 'center',
  },
});
