import { Calendar, Check, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CompactStepper, IconButton, radius, spacing, Text } from '../../../design';
import { useT } from '../../../i18n';
import { useTheme } from '../../../theme';
import { haptic } from '../../../utils/haptics';
import { DatePickerModal } from './DatePickerModal';

export type Batch = {
  /** ISO YYYY-MM-DD; null = "no expiry". */
  expiry: string | null;
  qty: number;
};

function formatForDisplay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function toISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

/**
 * Edits a list of per-expiry batches for receiving / corrections. Each
 * row carries `{qty, expiry}`. Tapping the date opens the picker; the
 * checkbox toggles "no expiry" for that single row. Replaces the legacy
 * "different expiry per pack" toggle that exploded into N qty=1 rows
 * even when the guard had three groups, not ten packs.
 */
export function BatchEditor({
  batches,
  onChange,
  minDate,
  unit,
}: {
  batches: Batch[];
  onChange: (next: Batch[]) => void;
  minDate?: Date;
  /** Optional unit string, e.g. "g" — appears next to total. */
  unit?: string | null;
}) {
  const t = useT();
  const { palette } = useTheme();
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const total = batches.reduce((s, b) => s + (b.qty || 0), 0);

  const update = (i: number, next: Partial<Batch>) => {
    onChange(batches.map((b, idx) => (idx === i ? { ...b, ...next } : b)));
  };
  const remove = (i: number) => {
    haptic.tap();
    onChange(batches.filter((_, idx) => idx !== i));
  };
  const add = () => {
    haptic.tap();
    // Seed new batch with qty=1 and copy last expiry as a hint —
    // common case is "another batch on the same day".
    const last = batches[batches.length - 1];
    onChange([...batches, { qty: 1, expiry: last?.expiry ?? null }]);
  };

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
          {t('totalLabel')}: {total}
          {unit ? ` ${unit}` : ''}
        </Text>
      </View>

      {batches.map((b, i) => (
        <View
          key={i}
          style={[
            styles.row,
            {
              backgroundColor: palette.surfaceContainerLowest,
              borderColor: palette.outlineVariant,
            },
          ]}
        >
          <View style={{ flex: 1, gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text variant="labelMedium" color={palette.onSurfaceVariant} style={{ minWidth: 32 }}>
                #{i + 1}
              </Text>
              <CompactStepper
                value={b.qty}
                onChange={(v) => update(i, { qty: v })}
                min={1}
              />
            </View>

            {b.expiry === null ? (
              <Pressable
                onPress={() => {
                  haptic.tap();
                  // Tapping "no expiry" row re-opens the picker so it's easy
                  // to switch back. Seed with today.
                  update(i, { expiry: toISO(new Date()) });
                  setEditingIdx(i);
                }}
                style={[styles.dateRow, { borderColor: palette.outlineVariant }]}
              >
                <Calendar size={18} color={palette.onSurfaceVariant} strokeWidth={2} />
                <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginLeft: spacing.sm }}>
                  {t('noExpiry')}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setEditingIdx(i)}
                style={[styles.dateRow, { borderColor: palette.outlineVariant }]}
              >
                <Calendar size={18} color={palette.onSurfaceVariant} strokeWidth={2} />
                <Text
                  variant="bodyMedium"
                  color={palette.onSurface}
                  style={{ marginLeft: spacing.sm, letterSpacing: 1 }}
                >
                  {formatForDisplay(b.expiry)}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => {
                haptic.tap();
                update(i, { expiry: b.expiry === null ? toISO(new Date()) : null });
              }}
              style={styles.noExpRow}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    backgroundColor: b.expiry === null ? palette.primary : 'transparent',
                    borderColor: b.expiry === null ? palette.primary : palette.outline,
                  },
                ]}
              >
                {b.expiry === null && <Check size={12} color={palette.onPrimary} strokeWidth={3} />}
              </View>
              <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
                {t('noExpiry')}
              </Text>
            </Pressable>
          </View>

          {batches.length > 1 && (
            <IconButton Icon={X} onPress={() => remove(i)} />
          )}
        </View>
      ))}

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
            update(editingIdx, { expiry: toISO(d) });
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
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 44,
  },
  noExpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
});
