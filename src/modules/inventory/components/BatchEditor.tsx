import { CalendarDays, CalendarOff, Trash2, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { CompactStepper, radius, spacing, Text } from '../../../design';
import { useT } from '../../../i18n';
import { useTheme } from '../../../theme';
import { roundQty } from '../../../units';
import { haptic } from '../../../utils/haptics';
import {
  compareExpiryAsc,
  expiryUrgency,
  formatExpiry,
  relativeExpiry,
  urgencyColors,
} from '../../../utils/expiry';
import { DatePickerModal } from './DatePickerModal';

export type Batch = {
  /** Tri-state:
   *    string    = ISO YYYY-MM-DD date
   *    null      = guard explicitly chose "no expiry"
   *    undefined = unset; both chips ("Pick expiry" / "No expiry") shown
   *  Downstream code that just needs "is there an expiry date" can keep
   *  using a truthy check; submit paths should coerce undefined → null. */
  expiry: string | null | undefined;
  qty: number;
};

function toISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

/**
 * Decimal quantity field that shows BASE units while the caller keeps
 * storing packs.
 *
 * `Batch.qty` is always pack-denominated (0.694 packs of a 500 g tub),
 * but nobody counts butter in fractional tubs — the guard thinks in
 * grams. `unitsPerPack` is the conversion factor for the display layer
 * only; the value handed back through `onChange` is still packs. With
 * `unitsPerPack = 1` this is a plain base-unit field.
 *
 * `draft` holds the raw keystrokes while the field has focus. Without it
 * the value round-trips through Number() on every keystroke, so "0." and
 * "347." collapse before the guard can finish typing the decimal.
 */
function BaseUnitInput({
  packs,
  unitsPerPack,
  onChange,
  style,
}: {
  packs: number;
  unitsPerPack: number;
  onChange: (packs: number) => void;
  style: React.ComponentProps<typeof TextInput>['style'];
}) {
  const { palette } = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const committed = packs === 0 ? '' : String(roundQty(packs * unitsPerPack));

  return (
    <TextInput
      value={draft ?? committed}
      onChangeText={(txt) => {
        const cleaned = txt.replace(/[^0-9.]/g, '');
        setDraft(cleaned);
        const n = cleaned === '' || cleaned === '.' ? 0 : Number(cleaned);
        // Keep the pack value at full precision — re-rounding here would
        // drift the base-unit number the guard just typed.
        onChange(Number.isFinite(n) ? n / unitsPerPack : 0);
      }}
      onBlur={() => setDraft(null)}
      keyboardType="decimal-pad"
      placeholder="0"
      placeholderTextColor={palette.onSurfaceVariant}
      style={style}
    />
  );
}

/**
 * Edits a list of per-expiry batches for receiving / corrections. Each
 * row carries `{qty, expiry}`. Expiry has one combined control:
 *   - Unset → two chips: "Pick date" (opens picker) and "No expiry".
 *   - Set   → a single urgency-colored chip (date · relative time · ×).
 *
 * Batches sort by expiry ascending (earliest first, no-expiry last) at
 * render time, so the visual order matches FEFO consumption. The caller's
 * source-of-truth list also gets the sort whenever a date is picked.
 */
export function BatchEditor({
  batches,
  onChange,
  minDate,
  unit,
  packSize,
  decimal = false,
  editInBaseUnits = false,
}: {
  batches: Batch[];
  onChange: (next: Batch[]) => void;
  minDate?: Date;
  /** Base unit string, e.g. "g". */
  unit?: string | null;
  /** Pack size — needed to render "2 × 500 g" (pack mode) vs raw unit
   *  (divisible). When omitted, falls back to bare qty + unit. */
  packSize?: number | null;
  decimal?: boolean;
  /**
   * Show and accept quantities in BASE units (grams, litres) instead of
   * raw packs, converting with `packSize`. `Batch.qty` stays in packs
   * either way — this only changes what the guard reads and types.
   *
   * Receiving leaves this off: intake is counted in whole packs off the
   * truck. Corrections turn it on, because "347 g of butter left" is
   * something a guard can weigh, and "0.694 tubs" is not.
   */
  editInBaseUnits?: boolean;
}) {
  const t = useT();
  const { palette } = useTheme();
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const divisible = decimal;
  /** Display multiplier: packs → what the guard sees. 1 = show packs. */
  const unitsPerPack =
    editInBaseUnits && packSize != null && packSize > 0 ? packSize : 1;

  // Auto-sort by expiry (earliest first, null last). Caller still owns
  // the array; we just present it FEFO-ordered.
  const sortedBatches = useMemo(
    () =>
      batches
        .map((b, originalIdx) => ({ b, originalIdx }))
        .sort((a, z) => compareExpiryAsc(a.b.expiry, z.b.expiry)),
    [batches],
  );

  const total = batches.reduce((s, b) => s + (b.qty || 0), 0);
  const ps = packSize ?? null;
  const usePackForm = !divisible && ps != null && ps !== 1;
  const totalDisplay = divisible
    ? String(roundQty(total * unitsPerPack))
    : String(total);
  const totalSuffix = usePackForm
    ? ` × ${ps}${unit ? ` ${unit}` : ''}`
    : unit ? ` ${unit}` : '';

  const updateByOriginal = (originalIdx: number, next: Partial<Batch>) => {
    const merged = batches.map((b, idx) => (idx === originalIdx ? { ...b, ...next } : b));
    onChange(merged);
  };
  const removeByOriginal = (originalIdx: number) => {
    haptic.tap();
    onChange(batches.filter((_, idx) => idx !== originalIdx));
  };
  const add = () => {
    haptic.tap();
    // undefined = unset; both chips visible. Forces a deliberate choice
    // instead of silently defaulting to "no expiry".
    onChange([...batches, { qty: divisible ? 0 : 1, expiry: undefined }]);
  };

  const labelForRowNumber = (visualIdx: number) => `#${visualIdx + 1}`;

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
          {t('batches').toUpperCase()}
        </Text>
        <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
          {t('totalLabel')}: {totalDisplay}{totalSuffix}
        </Text>
      </View>

      {sortedBatches.map(({ b, originalIdx }, visualIdx) => {
        const urgency = expiryUrgency(b.expiry);
        const colors = urgencyColors(urgency, palette);
        const canRemove = batches.length > 1;
        return (
          <View
            key={originalIdx}
            style={[
              styles.card,
              {
                backgroundColor: palette.surfaceContainerLowest,
                borderColor: palette.outlineVariant,
              },
            ]}
          >
            {/* ─── Left rail: batch number, centered ─── */}
            <View
              style={[
                styles.rail,
                styles.leftRail,
                {
                  backgroundColor: palette.surfaceContainerLow,
                  borderRightColor: palette.outlineVariant,
                },
              ]}
            >
              <Text
                variant="titleMedium"
                color={palette.onSurfaceVariant}
                style={{ fontWeight: '700' }}
              >
                {visualIdx + 1}
              </Text>
            </View>

            {/* ─── Middle: the actual fields ─── */}
            <View style={styles.middle}>
              {/* Qty section */}
              <View style={{ gap: spacing.xs }}>
                <Text variant="labelMedium" color={palette.onSurfaceVariant} style={styles.sectionLabel}>
                  {t('howMany').toUpperCase()}
                </Text>
                {divisible ? (
                  <View style={{ gap: spacing.xxs }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      <BaseUnitInput
                        packs={b.qty}
                        unitsPerPack={unitsPerPack}
                        onChange={(packs) => updateByOriginal(originalIdx, { qty: packs })}
                        style={[
                          styles.decimalInput,
                          {
                            borderColor: palette.outline,
                            color: palette.onSurface,
                            backgroundColor: palette.surface,
                          },
                        ]}
                      />
                      {unit ? (
                        <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
                          {unit}
                        </Text>
                      ) : null}
                    </View>
                    {/* Reminder of the pack this batch came out of, so the
                        guard can sanity-check "347 g" against "one 500 g
                        tub, part used". Only meaningful when a pack has
                        more than one base unit in it. */}
                    {unitsPerPack > 1 && unit ? (
                      <Text variant="labelMedium" color={palette.onSurfaceVariant}>
                        1 {t('pack')} = {unitsPerPack} {unit}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <CompactStepper
                    value={b.qty}
                    onChange={(v) => updateByOriginal(originalIdx, { qty: v })}
                    min={1}
                  />
                )}
              </View>

              {/* Expiry section */}
              <View style={{ gap: spacing.xs }}>
                <Text variant="labelMedium" color={palette.onSurfaceVariant} style={styles.sectionLabel}>
                  {t('expires').toUpperCase()}
                </Text>
              {/* Expiry row — three visual states:
                  • undefined → two chips, user must pick
                  • null      → "No expiry" confirmed chip with ×
                  • string    → date chip with × (urgency-colored) */}
              {b.expiry === undefined ? (
                <View style={styles.chipRow}>
                  <Pressable
                    onPress={() => {
                      haptic.tap();
                      setEditingIdx(originalIdx);
                    }}
                    style={[
                      styles.chip,
                      {
                        borderColor: palette.primary,
                        backgroundColor: palette.surfaceContainerLow,
                      },
                    ]}
                  >
                    <CalendarDays size={16} color={palette.primary} strokeWidth={2.2} />
                    <Text
                      variant="labelLarge"
                      color={palette.primary}
                      style={{ marginLeft: spacing.xs }}
                    >
                      {t('pickExpiry')}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      haptic.tap();
                      updateByOriginal(originalIdx, { expiry: null });
                    }}
                    style={[
                      styles.chip,
                      {
                        borderColor: palette.outline,
                        backgroundColor: 'transparent',
                      },
                    ]}
                  >
                    <CalendarOff size={16} color={palette.onSurfaceVariant} strokeWidth={2.2} />
                    <Text
                      variant="labelLarge"
                      color={palette.onSurfaceVariant}
                      style={{ marginLeft: spacing.xs }}
                    >
                      {t('noExpiry')}
                    </Text>
                  </Pressable>
                </View>
              ) : b.expiry === null ? (
                <Pressable
                  onPress={() => {
                    haptic.tap();
                    setEditingIdx(originalIdx);
                  }}
                  style={[
                    styles.expiryChip,
                    {
                      borderColor: palette.outline,
                      backgroundColor: palette.surfaceContainerLow,
                    },
                  ]}
                >
                  <CalendarOff size={16} color={palette.onSurfaceVariant} strokeWidth={2.2} />
                  <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                    <Text variant="titleMedium" color={palette.onSurface}>
                      {t('noExpiry')}
                    </Text>
                    <Text variant="labelMedium" color={palette.onSurfaceVariant}>
                      {t('tapToPickDate')}
                    </Text>
                  </View>
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      haptic.tap();
                      // Back to unset — re-shows both chips.
                      updateByOriginal(originalIdx, { expiry: undefined });
                    }}
                    hitSlop={10}
                    style={styles.clearBtn}
                  >
                    <X size={16} color={palette.onSurfaceVariant} strokeWidth={2.2} />
                  </Pressable>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => setEditingIdx(originalIdx)}
                  style={[
                    styles.expiryChip,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.bg,
                    },
                  ]}
                >
                  <CalendarDays size={16} color={colors.fg} strokeWidth={2.2} />
                  <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                    <Text variant="titleMedium" color={colors.fg}>
                      {formatExpiry(b.expiry)}
                    </Text>
                    {relativeExpiry(b.expiry, t) ? (
                      <Text variant="labelMedium" color={colors.fg} style={{ opacity: 0.85 }}>
                        {relativeExpiry(b.expiry, t)}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      haptic.tap();
                      // Clearing a picked date drops back to unset.
                      updateByOriginal(originalIdx, { expiry: undefined });
                    }}
                    hitSlop={10}
                    style={styles.clearBtn}
                  >
                    <X size={16} color={colors.fg} strokeWidth={2.2} />
                  </Pressable>
                </Pressable>
              )}
              </View>
            </View>

            {/* ─── Right rail: delete button, centered. Only when more
                 than one batch exists (can't delete the last one). ─── */}
            {canRemove ? (
              <Pressable
                onPress={() => removeByOriginal(originalIdx)}
                android_ripple={{ color: palette.outlineVariant, borderless: false }}
                style={[
                  styles.rail,
                  styles.rightRail,
                  {
                    backgroundColor: palette.surfaceContainerLow,
                    borderLeftColor: palette.outlineVariant,
                  },
                ]}
                hitSlop={6}
              >
                <Trash2 size={20} color={palette.error} strokeWidth={2.2} />
              </Pressable>
            ) : (
              // Keep the layout symmetrical even when the trash isn't shown,
              // so a single batch doesn't look unbalanced — render a muted
              // rail with no glyph.
              <View
                style={[
                  styles.rail,
                  styles.rightRail,
                  {
                    backgroundColor: palette.surfaceContainerLow,
                    borderLeftColor: palette.outlineVariant,
                    opacity: 0.5,
                  },
                ]}
              />
            )}
          </View>
        );
      })}

      <Pressable
        onPress={add}
        style={[
          styles.addBtn,
          { borderColor: palette.outline, backgroundColor: palette.surfaceContainerLow },
        ]}
      >
        <Text variant="titleMedium" color={palette.primary}>
          {t('addBatch')}
        </Text>
      </Pressable>

      {editingIdx != null && (
        <DatePickerModal
          visible={editingIdx != null}
          value={batches[editingIdx]?.expiry ? new Date(batches[editingIdx].expiry as string) : null}
          minimumDate={minDate}
          onSelect={(d) => {
            updateByOriginal(editingIdx, { expiry: toISO(d) });
          }}
          onDismiss={() => setEditingIdx(null)}
        />
      )}
    </View>
  );
}

const RAIL_WIDTH = 44;

const styles = StyleSheet.create({
  /** Outer card — wraps the three lanes (left rail, middle content, right rail).
   *  Border + clip so the rails sit flush with the card edges. */
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  /** Slim vertical lane. Used for both the batch number (left) and the
   *  trash button (right) — same dimensions so the card looks symmetrical. */
  rail: {
    width: RAIL_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftRail: {
    borderRightWidth: 1,
  },
  rightRail: {
    borderLeftWidth: 1,
  },
  /** The main fields lane. Padding lives here instead of on the card so
   *  the rails can paint edge-to-edge. */
  middle: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  /** Small uppercase labels above each control. Cheap visual hierarchy. */
  sectionLabel: {
    letterSpacing: 0.6,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    minHeight: 40,
  },
  expiryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    minHeight: 52,
  },
  clearBtn: {
    padding: 4,
    marginLeft: spacing.sm,
  },
  addBtn: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  decimalInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 96,
    fontSize: 16,
    minHeight: 40,
  },
});
