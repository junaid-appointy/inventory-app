import { ArrowDownToLine } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AmountStepper } from '../../../components/AmountStepper';
import { DateTile } from '../../../components/DateTile';
import { spacing, Text } from '../../../design';
import { useT } from '../../../i18n';
import { useTheme } from '../../../theme';
import type { LotAllocation } from './LotPicker';

/**
 * Which packs the amount comes out of, when stock has more than one expiry
 * date. Each row is a calendar page (its date, coloured by how soon), how
 * many are left on that date, and how many to take from it. The oldest row
 * is marked "Use first"; the amounts start there (oldest first) but the
 * person can change any row, and we record what they actually took.
 */
export function UseFirstRows({ lots, onChange }: { lots: LotAllocation[]; onChange: (next: LotAllocation[]) => void }) {
  const t = useT();
  const { palette } = useTheme();
  // Lots arrive oldest first; the first one that still has stock is "use first".
  const firstIdx = lots.findIndex((l) => l.available > 0);

  return (
    <View style={{ gap: spacing.sm }}>
      {lots.map((l, i) => {
        const first = i === firstIdx;
        return (
          <View
            key={`${l.expiry ?? 'none'}-${i}`}
            style={[
              styles.row,
              { borderColor: first ? palette.primary : palette.outlineVariant, borderWidth: first ? 2 : 1, backgroundColor: palette.surfaceContainerLowest },
            ]}
          >
            <View style={{ alignItems: 'center', width: 72 }}>
              <DateTile iso={l.expiry} size="md" />
              <Text variant="labelMedium" color={palette.onSurfaceVariant} style={{ marginTop: 4 }}>
                {t('nLeft', { n: l.available })}
              </Text>
            </View>
            <View style={{ flex: 1, gap: spacing.xs }}>
              {first ? (
                <View style={[styles.badge, { backgroundColor: palette.primaryContainer }]}>
                  <ArrowDownToLine size={14} color={palette.onPrimaryContainer} />
                  <Text variant="labelMedium" color={palette.onPrimaryContainer} style={{ fontWeight: '700' }}>
                    {t('useFirstBadge')}
                  </Text>
                </View>
              ) : null}
              <AmountStepper
                compact
                value={l.take}
                min={0}
                max={l.available}
                onChange={(n) => onChange(lots.map((x, idx) => (idx === i ? { ...x, take: n } : x)))}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: 18, padding: spacing.md },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
});
