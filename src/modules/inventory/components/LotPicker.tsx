import React, { useEffect, useMemo } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { CompactStepper, radius, spacing, Text } from '../../../design';
import { useT } from '../../../i18n';
import { useTheme } from '../../../theme';
import {
  expiryUrgency,
  formatExpiry,
  relativeExpiry,
  urgencyColors,
} from '../../../utils/expiry';

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
  packSize,
  decimal = false,
}: {
  /** Allocation rows. Order = FEFO from caller. */
  lots: LotAllocation[];
  onChange: (next: LotAllocation[]) => void;
  /** What the guard initially asked for. Used for the "Taken N of M" badge. */
  desiredQty: number;
  unit?: string | null;
  /** Pack size — needed to render "2 × 500 g" (pack mode) vs raw unit
   *  (divisible). When omitted, falls back to bare qty + unit. */
  packSize?: number | null;
  /** When true, per-lot input accepts decimals (divisible products). */
  decimal?: boolean;
}) {
  const t = useT();
  const { palette } = useTheme();

  // Unit/pack hint shown ONCE at the picker header — never repeated on
  // every row. Pack mode with pack_size > 1 expands as "× 500 g"; divisible
  // mode uses the raw unit ("kg"); fallback omits when neither is known.
  const usePackForm = !decimal && packSize != null && packSize !== 1;
  const headerUnitHint = usePackForm
    ? `× ${packSize}${unit ? ` ${unit}` : ''}`
    : unit
      ? unit
      : '';

  // The maximum across all lots — surfaces the real ceiling so the user
  // doesn't think "Taken 1 of 1" means only 1 exists when really 4 do.
  const grandTotal = useMemo(
    () => lots.reduce((s, l) => s + (l.available || 0), 0),
    [lots],
  );

  const total = useMemo(() => lots.reduce((s, l) => s + (l.take || 0), 0), [lots]);
  const complete = total > 0 && total === grandTotal;
  const fmtNum = (n: number) =>
    Number.isInteger(n) ? String(n) : (Math.round(n * 1000) / 1000).toString();

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
      {/* Header: title on the left, prominent "TAKEN / TOTAL" badge on the
          right. Badge turns primary when fully allocated so the user gets
          an unmissable visual cue that the picker is satisfied. */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="labelLarge" color={palette.onSurfaceVariant}>
            {t('pickFromBatch').toUpperCase()}
          </Text>
          {headerUnitHint ? (
            <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: 2 }}>
              1 = {headerUnitHint}
            </Text>
          ) : null}
        </View>
        <View
          style={[
            styles.headerBadge,
            {
              backgroundColor: complete
                ? palette.primary
                : palette.surfaceContainerHighest,
              borderColor: complete ? palette.primary : palette.outlineVariant,
            },
          ]}
        >
          <Text
            variant="headlineSmall"
            color={complete ? palette.onPrimary : palette.onSurface}
            style={{ fontWeight: '700' }}
          >
            {fmtNum(total)}
          </Text>
          <Text
            variant="bodyMedium"
            color={complete ? palette.onPrimary : palette.onSurfaceVariant}
          >
            {' / '}{fmtNum(grandTotal)}
          </Text>
        </View>
      </View>

      {lots.map((lot, i) => {
        const isFefoSuggested = i === 0;
        const lotComplete = lot.take > 0 && lot.take === lot.available;
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
              {(() => {
                const urgency = expiryUrgency(lot.expiry);
                const colors = urgencyColors(urgency, palette);
                const rel = relativeExpiry(lot.expiry, t);
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                    <View
                      style={[
                        styles.expiryPill,
                        {
                          backgroundColor: colors.bg,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Text variant="labelLarge" color={colors.fg}>
                        {formatExpiry(lot.expiry)}
                      </Text>
                    </View>
                    {rel ? (
                      <Text variant="labelMedium" color={colors.fg}>
                        {rel}
                      </Text>
                    ) : null}
                    {isFefoSuggested && (
                      <Text variant="labelMedium" color={palette.primary}>
                        ← {t('suggested')}
                      </Text>
                    )}
                  </View>
                );
              })()}
              {/* Per-lot count: "1 / 4" with the taken number colored. No
                  unit suffix — the header hint covers it. */}
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6, gap: 2 }}>
                <Text
                  variant="titleLarge"
                  color={lot.take > 0 ? (lotComplete ? palette.primary : palette.onSurface) : palette.onSurfaceVariant}
                  style={{ fontWeight: '700' }}
                >
                  {fmtNum(lot.take)}
                </Text>
                <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
                  {' / '}{fmtNum(lot.available)}
                </Text>
              </View>
            </View>
            {decimal ? (
              <TextInput
                value={lot.take === 0 ? '' : String(lot.take)}
                onChangeText={(txt) => {
                  const cleaned = txt.replace(/[^0-9.]/g, '');
                  const n = cleaned === '' || cleaned === '.' ? 0 : Number(cleaned);
                  const safe = Number.isFinite(n) ? n : 0;
                  const clamped = Math.max(0, Math.min(lot.available, safe));
                  onChange(lots.map((l, idx) => (idx === i ? { ...l, take: clamped } : l)));
                }}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={palette.onSurfaceVariant}
                style={[
                  styles.decimalInput,
                  {
                    borderColor: palette.outline,
                    color: palette.onSurface,
                    backgroundColor: palette.surface,
                  },
                ]}
              />
            ) : (
              <CompactStepper
                value={lot.take}
                onChange={(v) => {
                  const clamped = Math.max(0, Math.min(lot.available, v));
                  onChange(lots.map((l, idx) => (idx === i ? { ...l, take: clamped } : l)));
                }}
                min={0}
                max={lot.available}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    minWidth: 88,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  decimalInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 96,
    fontSize: 16,
    minHeight: 40,
    textAlign: 'right',
  },
  expiryPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
