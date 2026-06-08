import { CalendarDays, CalendarOff, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { CompactStepper, IconButton, radius, spacing, Text } from '../../../design';
import { useT } from '../../../i18n';
import { useTheme } from '../../../theme';
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
  dispenseMode = 'pack',
}: {
  batches: Batch[];
  onChange: (next: Batch[]) => void;
  minDate?: Date;
  /** Base unit string, e.g. "g". */
  unit?: string | null;
  /** Pack size — needed to render "2 × 500 g" (pack mode) vs raw unit
   *  (divisible). When omitted, falls back to bare qty + unit. */
  packSize?: number | null;
  /** 'pack' → integer CompactStepper. 'divisible' → decimal TextInput
   *  in base units (e.g. kg, ml). */
  dispenseMode?: 'pack' | 'divisible';
}) {
  const t = useT();
  const { palette } = useTheme();
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const divisible = dispenseMode === 'divisible';

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
    ? (Math.round(total * 1000) / 1000).toString()
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
        return (
          <View
            key={originalIdx}
            style={[
              styles.row,
              {
                backgroundColor: palette.surfaceContainerLowest,
                borderColor: palette.outlineVariant,
              },
            ]}
          >
            <View style={{ flex: 1, gap: spacing.md }}>
              {/* Qty row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text variant="labelMedium" color={palette.onSurfaceVariant} style={{ minWidth: 32 }}>
                  {labelForRowNumber(visualIdx)}
                </Text>
                {divisible ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <TextInput
                      value={b.qty === 0 ? '' : String(b.qty)}
                      onChangeText={(txt) => {
                        const cleaned = txt.replace(/[^0-9.]/g, '');
                        const n = cleaned === '' || cleaned === '.' ? 0 : Number(cleaned);
                        updateByOriginal(originalIdx, { qty: Number.isFinite(n) ? n : 0 });
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
                    {unit ? (
                      <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
                        {unit}
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
                      Pick expiry
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
                      No expiry
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
                      No expiry
                    </Text>
                    <Text variant="labelMedium" color={palette.onSurfaceVariant}>
                      Tap to pick a date instead
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
                    {relativeExpiry(b.expiry) ? (
                      <Text variant="labelMedium" color={colors.fg} style={{ opacity: 0.85 }}>
                        {relativeExpiry(b.expiry)}
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

            {batches.length > 1 && (
              <IconButton Icon={X} onPress={() => removeByOriginal(originalIdx)} />
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
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
