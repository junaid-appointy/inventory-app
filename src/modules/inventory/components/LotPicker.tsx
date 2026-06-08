import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { CompactStepper, radius, spacing, Text } from '../../../design';
import { useT } from '../../../i18n';
import { useTheme } from '../../../theme';

export type LotAvailability = {
  /** ISO YYYY-MM-DD; null = no expiry. */
  expiry: string | null;
  /** Total currently in stock for this lot. */
  available: number;
};

export type LotAllocation = LotAvailability & {
  /** How much the guard is taking from this lot. 0 = none. */
  take: number;
};

function formatForDisplay(iso: string | null): string {
  if (iso === null) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Suggest a FEFO allocation: take from the earliest-expiry lot first.
 * Returns one entry per available lot (zero `take` if not used). Lots
 * are expected in FEFO order from the caller.
 */
export function suggestFEFO(
  lots: LotAvailability[],
  totalQty: number,
): LotAllocation[] {
  let remaining = totalQty;
  return lots.map((l) => {
    const take = Math.max(0, Math.min(l.available, remaining));
    remaining -= take;
    return { ...l, take };
  });
}

/**
 * Per-lot qty picker for dispense. Lots are listed in FEFO order with
 * the earliest highlighted as "suggested" — this is the **soft nudge**:
 * we record what the guard actually picked rather than enforcing FEFO,
 * so accounting matches physical reality. Guards can adjust each row;
 * the editor enforces the per-lot ceiling so they can't take more than
 * exists in any batch.
 *
 * The component is fully controlled — caller owns `lots` and the
 * resulting allocation via `onChange`. Total taken is derived from
 * `lots.reduce((s, l) => s + l.take, 0)` and displayed at the bottom.
 */
export function LotPicker({
  lots,
  onChange,
  desiredQty,
  unit,
}: {
  /** Allocation rows. Order = FEFO from caller. */
  lots: LotAllocation[];
  onChange: (next: LotAllocation[]) => void;
  /** What the guard initially asked for. Used for the "Taken N of M" badge. */
  desiredQty: number;
  unit?: string | null;
}) {
  const t = useT();
  const { palette } = useTheme();

  const total = useMemo(() => lots.reduce((s, l) => s + (l.take || 0), 0), [lots]);

  // Auto-seed allocation with FEFO when the parent passes the freshly-
  // loaded availability without any takes set. Idempotent — caller
  // controls reseeding by changing the `lots` reference.
  useEffect(() => {
    const noneAllocated = lots.every((l) => l.take === 0);
    if (noneAllocated && desiredQty > 0) {
      onChange(suggestFEFO(lots, desiredQty));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots.length]);

  if (lots.length === 0) {
    return (
      <View>
        <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
          —
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <Text variant="labelLarge" color={palette.onSurfaceVariant}>
          {t('pickFromBatch').toUpperCase()}
        </Text>
        <Text
          variant="bodyMedium"
          color={total === desiredQty ? palette.primary : palette.onSurfaceVariant}
        >
          {t('takenTotal')}: {total} {t('ofTotal')} {desiredQty}
          {unit ? ` ${unit}` : ''}
        </Text>
      </View>

      {lots.map((lot, i) => {
        const isFefoSuggested = i === 0;
        return (
          <View
            key={`${lot.expiry ?? '__none__'}-${i}`}
            style={[
              styles.row,
              {
                backgroundColor: palette.surfaceContainerLowest,
                borderColor:
                  isFefoSuggested && lot.take > 0
                    ? palette.primary
                    : palette.outlineVariant,
                borderWidth: isFefoSuggested && lot.take > 0 ? 2 : 1,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text variant="titleMedium" color={palette.onSurface} style={{ letterSpacing: 1 }}>
                  {formatForDisplay(lot.expiry)}
                </Text>
                {isFefoSuggested && (
                  <Text variant="labelMedium" color={palette.primary}>
                    ← {t('suggested')}
                  </Text>
                )}
              </View>
              <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: 2 }}>
                {lot.available} {t('inStock')}
              </Text>
            </View>
            <CompactStepper
              value={lot.take}
              onChange={(v) => {
                const clamped = Math.max(0, Math.min(lot.available, v));
                onChange(lots.map((l, idx) => (idx === i ? { ...l, take: clamped } : l)));
              }}
              min={0}
              max={lot.available}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.md,
  },
});
