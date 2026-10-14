import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Camera, Check } from 'lucide-react-native';
import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Button, IconBadge, RowDivider, spacing, Text } from '../../../design';
import { categoryIcon } from '../categoryIcon';
import { PhotoTick, TickLegend, usePhotoTicks, worstTick } from '../components/PhotoTicks';
import { useT } from '../../../i18n';
import { RootStackParamList, DeliverySummaryItem } from '../../../navigation/types';
import { useTheme } from '../../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'DeliverySummary'>;

export function DeliverySummaryScreen({ navigation, route }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const { items, totalItems, totalQty, withPhoto } = route.params;
  // Each item's photo, travelling like a WhatsApp message: clock, tick, two ticks.
  const allPhotoIds = items.flatMap((i) => i.photoIds ?? []);
  const ticks = usePhotoTicks(allPhotoIds);

  return (
    <View style={[styles.safe, { backgroundColor: palette.background }]}>

      <FlatList
        data={items}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.hero}>
            <View style={[styles.tick, { backgroundColor: palette.successContainer }]}>
              <Check size={44} color={palette.onSuccessContainer} strokeWidth={3} />
            </View>
            <Text variant="headlineMedium" style={{ marginTop: spacing.lg, textAlign: 'center', fontWeight: '800' }}>
              {t('deliverySaved')}
            </Text>
            <Text
              variant="bodyLarge"
              color={palette.onSurfaceVariant}
              style={{ marginTop: spacing.sm, textAlign: 'center' }}
            >
              {t('deliveryCount', { items: totalItems, packs: totalQty })}
            </Text>
            <Text
              variant="bodyMedium"
              color={palette.onSurfaceVariant}
              style={{ marginTop: spacing.xs, textAlign: 'center' }}
            >
              {t('willSyncLater')}
            </Text>
            {withPhoto ? (
              <View style={[styles.photoNote, { backgroundColor: palette.surfaceContainerLow }]}>
                <View style={styles.photoNoteHead}>
                  <Camera size={20} color={palette.onSurfaceVariant} />
                  <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ flex: 1 }}>
                    {t('photoGoesToGroup')}
                  </Text>
                </View>
                {allPhotoIds.length > 0 ? <TickLegend /> : null}
              </View>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={() => <RowDivider />}
        renderItem={({ item }: { item: DeliverySummaryItem }) => (
          <View style={styles.row}>
            <IconBadge Icon={categoryIcon(item.category)} size={44} />
            <Text variant="titleMedium" style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
              {item.name}
            </Text>
            <Text variant="titleLarge" style={{ fontWeight: '800' }}>
              {item.label ?? item.qty}
            </Text>
            {(() => {
              const state = worstTick((item.photoIds ?? []).map((id) => ticks[id] ?? 'phone'));
              return state ? <PhotoTick state={state} /> : null;
            })()}
          </View>
        )}
      />

      <View style={[styles.footer, { backgroundColor: palette.surface, borderTopColor: palette.outlineVariant }]}>
        <Button
          label={t('backHome')}
          size="lg"
          fullWidth
          onPress={() => navigation.navigate('Home')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { paddingBottom: spacing.xxxl },
  hero: { alignItems: 'center', paddingTop: spacing.xxxl + spacing.xl, paddingBottom: spacing.xl, paddingHorizontal: spacing.xl },
  tick: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  photoNote: { gap: spacing.sm, marginTop: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: 14, alignSelf: 'stretch' },
  photoNoteHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, minHeight: 64, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
