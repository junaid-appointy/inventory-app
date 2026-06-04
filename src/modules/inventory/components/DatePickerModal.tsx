import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, radius, spacing, Text } from '../../../design';
import { haptic } from '../../../utils/haptics';
import { useTheme } from '../../../theme';
import { useT } from '../../../i18n';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

type Props = {
  visible: boolean;
  value: Date | null;
  minimumDate?: Date;
  onSelect: (date: Date) => void;
  onDismiss: () => void;
};

/**
 * Pure-JS calendar date picker modal. No native module required.
 * Material 3 styled with month navigation and day grid.
 */
export function DatePickerModal({ visible, value, minimumDate, onSelect, onDismiss }: Props) {
  const { palette } = useTheme();
  const t = useT();
  const today = new Date();
  const [viewYear, setViewYear] = useState(value?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(value?.getMonth() ?? today.getMonth());
  const [selected, setSelected] = useState<Date | null>(value);
  // Modal panes: "day" (calendar grid) → "month" (12-tile grid) →
  // "year" (8-tile grid, scrollable). Tapping the title cycles between
  // them so the user can jump 10 years in two taps instead of pressing
  // the chevron a hundred times.
  const [pane, setPane] = useState<'day' | 'month' | 'year'>('day');

  // Reset view when modal opens with new value
  React.useEffect(() => {
    if (visible) {
      const d = value ?? today;
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      setSelected(value);
      setPane('day');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const days = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const grid: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) grid.push(null);
    for (let d = 1; d <= daysInMonth; d++) grid.push(d);
    return grid;
  }, [viewYear, viewMonth]);

  const goBack = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goForward = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const isDisabled = (day: number) => {
    if (!minimumDate) return false;
    const d = new Date(viewYear, viewMonth, day);
    const min = new Date(minimumDate.getFullYear(), minimumDate.getMonth(), minimumDate.getDate());
    return d < min;
  };

  const isSelected = (day: number) => {
    if (!selected) return false;
    return (
      selected.getFullYear() === viewYear &&
      selected.getMonth() === viewMonth &&
      selected.getDate() === day
    );
  };

  const isToday = (day: number) => {
    return (
      today.getFullYear() === viewYear &&
      today.getMonth() === viewMonth &&
      today.getDate() === day
    );
  };

  const handleDayPress = (day: number) => {
    if (isDisabled(day)) return;
    haptic.tap();
    setSelected(new Date(viewYear, viewMonth, day));
  };

  const handleConfirm = () => {
    if (selected) {
      onSelect(selected);
    }
    onDismiss();
  };

  const CELL = 40;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.card, { backgroundColor: palette.surface }]}>
          {/* Month/Year header — title is now tappable to switch panes */}
          <View style={styles.header}>
            <Pressable
              onPress={pane === 'day' ? goBack : undefined}
              hitSlop={12}
              style={[styles.navBtn, pane !== 'day' && { opacity: 0 }]}
              disabled={pane !== 'day'}
            >
              <ChevronLeft size={24} color={palette.onSurface} />
            </Pressable>
            <Pressable
              onPress={() => {
                haptic.tap();
                setPane((p) => (p === 'day' ? 'month' : p === 'month' ? 'year' : 'day'));
              }}
              hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text variant="titleMedium">
                {pane === 'year'
                  ? 'Pick year'
                  : pane === 'month'
                  ? `${viewYear} · pick month`
                  : `${MONTH_NAMES[viewMonth]} ${viewYear}`}
              </Text>
              <ChevronDown size={18} color={palette.onSurfaceVariant} />
            </Pressable>
            <Pressable
              onPress={pane === 'day' ? goForward : undefined}
              hitSlop={12}
              style={[styles.navBtn, pane !== 'day' && { opacity: 0 }]}
              disabled={pane !== 'day'}
            >
              <ChevronRight size={24} color={palette.onSurface} />
            </Pressable>
          </View>

          {pane === 'day' && (
            <>
              {/* Day-of-week labels */}
              <View style={styles.weekRow}>
                {DAY_NAMES.map((d) => (
                  <View key={d} style={[styles.cell, { width: CELL, height: 28 }]}>
                    <Text variant="labelMedium" color={palette.onSurfaceVariant}>
                      {d}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Day grid */}
              <View style={styles.grid}>
                {days.map((day, idx) => {
                  if (day === null) {
                    return <View key={`e-${idx}`} style={{ width: CELL, height: CELL }} />;
                  }
                  const disabled = isDisabled(day);
                  const sel = isSelected(day);
                  const tod = isToday(day);
                  return (
                    <Pressable
                      key={day}
                      disabled={disabled}
                      onPress={() => handleDayPress(day)}
                      style={[
                        styles.cell,
                        {
                          width: CELL,
                          height: CELL,
                          borderRadius: CELL / 2,
                          backgroundColor: sel ? palette.primary : 'transparent',
                        },
                        tod && !sel && { borderWidth: 1, borderColor: palette.primary },
                      ]}
                    >
                      <Text
                        variant="bodyLarge"
                        color={
                          disabled
                            ? palette.outlineVariant
                            : sel
                            ? palette.onPrimary
                            : palette.onSurface
                        }
                      >
                        {day}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {pane === 'month' && (
            <View style={styles.tileGrid}>
              {MONTH_NAMES.map((m, i) => {
                const isCurrent = i === viewMonth;
                return (
                  <Pressable
                    key={m}
                    onPress={() => {
                      haptic.tap();
                      setViewMonth(i);
                      setPane('day');
                    }}
                    style={[
                      styles.tile,
                      isCurrent && { backgroundColor: palette.primary },
                    ]}
                  >
                    <Text variant="bodyLarge" color={isCurrent ? palette.onPrimary : palette.onSurface}>
                      {m.slice(0, 3)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {pane === 'year' && (
            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={styles.tileGrid}>
              {(() => {
                // Show 16 years centred on viewYear, then ranges below
                const start = viewYear - 8;
                const years: number[] = [];
                for (let y = start; y < start + 24; y++) years.push(y);
                return years.map((y) => {
                  const isCurrent = y === viewYear;
                  return (
                    <Pressable
                      key={y}
                      onPress={() => {
                        haptic.tap();
                        setViewYear(y);
                        setPane('month');
                      }}
                      style={[
                        styles.tile,
                        isCurrent && { backgroundColor: palette.primary },
                      ]}
                    >
                      <Text variant="bodyLarge" color={isCurrent ? palette.onPrimary : palette.onSurface}>
                        {y}
                      </Text>
                    </Pressable>
                  );
                });
              })()}
            </ScrollView>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <Button label={t('cancel')} variant="text" onPress={onDismiss} size="md" />
            <Button
              label={t('select')}
              onPress={handleConfirm}
              size="md"
              disabled={!selected}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '90%',
    maxWidth: 360,
    borderRadius: radius.lg,
    padding: spacing.lg,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 2,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 6,
  },
  tile: {
    width: 72,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
