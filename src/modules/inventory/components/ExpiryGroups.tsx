import { CalendarPlus, Trash2, type LucideIcon } from 'lucide-react-native';
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AmountStepper } from '../../../components/AmountStepper';
import { DateTile } from '../../../components/DateTile';
import { PackIcons } from '../../../components/PackIcons';
import { spacing, Text } from '../../../design';
import { useT } from '../../../i18n';
import { useTheme } from '../../../theme';
import { compareExpiryAsc, relativeExpiry } from '../../../utils/expiry';
import { haptic } from '../../../utils/haptics';
import type { Batch } from './BatchEditor';
import { DatePickerModal } from './DatePickerModal';

function toISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

/**
 * Packs that arrived with different expiry dates, drawn so it reads
 * without reading: each row is [calendar page]  − 3 +  [bin], meaning
 * "3 packs expire on this date". Rows sort earliest first (the order
 * they should be used). The total at the top is boxes plus a number.
 *
 * Every row here has a date: choosing a date means the date exists, so a
 * tap goes straight to the calendar with no "no expiry" detour. ("No
 * expiry" is answered once, on the Receive screen, before any date.)
 */
export function ExpiryGroups({
  batches,
  onChange,
  min = 1,
  unitWord,
  Icon,
  single,
}: {
  batches: Batch[];
  onChange: (next: Batch[]) => void;
  /** Lowest amount per row: 1 when receiving, 0 when counting a shelf. */
  min?: number;
  /** Word under the total (default "packs"). */
  unitWord?: string;
  /** The item's category icon, drawn on the pack pictures. */
  Icon?: LucideIcon;
  /** One-thing items (bottles): single tiles instead of closed packs. */
  single?: boolean;
}) {
  const t = useT();
  const { palette } = useTheme();
  // Which row the calendar is open for, and whether that row was just
  // added (closing the calendar without a date then removes it again).
  const [calendarFor, setCalendarFor] = useState<number | null>(null);
  const [newRow, setNewRow] = useState<number | null>(null);
  // The calendar calls onSelect and then onDismiss in the same tap. This
  // remembers that a date was picked, so onDismiss does not mistake the
  // just-dated row for an empty one and delete it again.
  const picked = useRef(false);
  const openCalendar = (row: number) => {
    picked.current = false;
    setCalendarFor(row);
  };

  const total = batches.reduce((s, b) => s + (b.qty || 0), 0);
  const rows = useMemo(
    () => batches.map((b, i) => ({ b, i })).sort((a, z) => compareExpiryAsc(a.b.expiry ?? null, z.b.expiry ?? null)),
    [batches],
  );

  const update = (i: number, next: Partial<Batch>) => onChange(batches.map((b, idx) => (idx === i ? { ...b, ...next } : b)));
  const remove = (i: number) => {
    haptic.tap();
    onChange(batches.filter((_, idx) => idx !== i));
  };
  const addRow = () => {
    haptic.tap();
    onChange([...batches, { qty: 1, expiry: undefined }]);
    // Straight to the calendar for the new row.
    setNewRow(batches.length);
    openCalendar(batches.length);
  };

  return (
    <View style={{ gap: spacing.md }}>
      {/* Total, as boxes and a number. */}
      <View style={[styles.total, { backgroundColor: palette.surfaceContainerLow }]}>
        <PackIcons count={total} Icon={Icon} single={single} />
        <Text style={{ fontSize: 36, lineHeight: 42, fontWeight: '800', color: palette.onSurface }}>{total}</Text>
        <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
          {unitWord ?? t('packsWord')}
        </Text>
      </View>

      {rows.map(({ b, i }) => {
        const rel = b.expiry ? relativeExpiry(b.expiry, t) : null;
        return (
          <View key={i} style={[styles.row, { borderColor: palette.outlineVariant, backgroundColor: palette.surfaceContainerLowest }]}>
            <Pressable onPress={() => openCalendar(i)} style={{ alignItems: 'center', width: 76 }} accessibilityRole="button" accessibilityLabel={t('expiryDateTitle')}>
              <DateTile iso={b.expiry} size="md" />
              <Text variant="labelMedium" color={palette.onSurfaceVariant} numberOfLines={1} style={{ marginTop: 4 }}>
                {b.expiry === undefined ? t('pickDateShort') : b.expiry === null ? t('noDateShort') : rel ?? ''}
              </Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <AmountStepper compact value={b.qty} onChange={(n) => update(i, { qty: n })} min={min} />
            </View>
            {batches.length > 1 ? (
              <Pressable onPress={() => remove(i)} hitSlop={10} style={styles.bin} accessibilityLabel={t('remove')}>
                <Trash2 size={22} color={palette.onSurfaceVariant} />
              </Pressable>
            ) : (
              <View style={styles.bin} />
            )}
          </View>
        );
      })}

      <Pressable
        onPress={addRow}
        accessibilityRole="button"
        style={({ pressed }) => [styles.add, { borderColor: palette.primary, backgroundColor: pressed ? palette.primaryContainer : 'transparent' }]}
      >
        <CalendarPlus size={24} color={palette.primary} />
        <Text variant="titleMedium" color={palette.primary} style={{ fontWeight: '700' }}>
          {t('addAnotherDate')}
        </Text>
      </Pressable>

      <DatePickerModal
        visible={calendarFor !== null}
        value={calendarFor !== null && batches[calendarFor]?.expiry ? new Date(batches[calendarFor].expiry as string) : null}
        minimumDate={new Date()}
        onSelect={(d) => {
          picked.current = true;
          if (calendarFor !== null) update(calendarFor, { expiry: toISO(d) });
          setCalendarFor(null);
          setNewRow(null);
        }}
        onDismiss={() => {
          // A row added a moment ago and closed WITHOUT a date is dropped, so
          // no empty "pick date" row is left behind.
          if (!picked.current && newRow !== null && calendarFor === newRow && batches[newRow]?.expiry === undefined) {
            onChange(batches.filter((_, idx) => idx !== newRow));
          }
          setCalendarFor(null);
          setNewRow(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  total: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg, paddingHorizontal: spacing.md, borderRadius: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: 18, padding: spacing.md },
  bin: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 60,
    borderRadius: 18,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
});
