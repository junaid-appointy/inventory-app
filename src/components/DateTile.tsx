import { CalendarOff, CalendarPlus } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { useTheme } from '../theme';
import { expiryUrgency } from '../utils/expiry';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Two fixed sizes with hand-set type, so the tile looks the same wherever
 * it appears (it used to scale from any number and drifted). Line heights
 * are explicit and Android font padding is off, so the digits sit exactly
 * centred instead of riding high.
 */
const SIZES = {
  sm: { w: 44, h: 48, r: 11, month: 10, monthLh: 12, day: 19, dayLh: 21, year: 9, yearLh: 11, icon: 20 },
  md: { w: 56, h: 60, r: 14, month: 11, monthLh: 13, day: 25, dayLh: 28, year: 10, yearLh: 12, icon: 24 },
} as const;

export type DateTileSize = keyof typeof SIZES;

/**
 * A date drawn like a phone's calendar icon: month in small capitals, the
 * day big, the year small. The month's colour says how soon: green fine,
 * amber within a month, red expired (expired also gets a red edge). A
 * crossed calendar means no expiry date; a dashed tile with + means the
 * date still has to be picked.
 */
export function DateTile({ iso, size = 'md' }: { iso: string | null | undefined; size?: DateTileSize }) {
  const { palette } = useTheme();
  const d = SIZES[size];
  const frame = { width: d.w, height: d.h, borderRadius: d.r };

  if (iso === undefined) {
    return (
      <View style={[styles.tile, styles.center, frame, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: palette.primary, backgroundColor: palette.primaryContainer }]}>
        <CalendarPlus size={d.icon} color={palette.onPrimaryContainer} strokeWidth={2} />
      </View>
    );
  }
  if (iso === null) {
    return (
      <View style={[styles.tile, styles.center, frame, { borderColor: palette.outlineVariant, backgroundColor: palette.surfaceContainerLow }]}>
        <CalendarOff size={d.icon} color={palette.onSurfaceVariant} strokeWidth={1.8} />
      </View>
    );
  }

  const [y, m, day] = iso.split('-').map(Number);
  const urgency = expiryUrgency(iso);
  const accent = urgency === 'expired' ? palette.error : urgency === 'soon' ? palette.amber : palette.success;

  return (
    <View
      style={[
        styles.tile,
        styles.center,
        styles.lift,
        frame,
        { borderColor: urgency === 'expired' ? palette.error : palette.outlineVariant, backgroundColor: palette.surfaceContainerLowest },
      ]}
    >
      <RNText style={[styles.txt, { fontSize: d.month, lineHeight: d.monthLh, color: accent, fontWeight: '800', letterSpacing: 0.8 }]}>
        {MONTHS[(m ?? 1) - 1]}
      </RNText>
      <RNText style={[styles.txt, { fontSize: d.day, lineHeight: d.dayLh, color: palette.onSurface, fontWeight: '700' }]}>{day}</RNText>
      <RNText style={[styles.txt, { fontSize: d.year, lineHeight: d.yearLh, color: palette.onSurfaceVariant, fontWeight: '500' }]}>{y}</RNText>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderWidth: 1, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  lift: { elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  txt: { includeFontPadding: false, textAlignVertical: 'center', textAlign: 'center' },
});
