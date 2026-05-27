import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check } from 'lucide-react-native';
import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  AppBar,
  Button,
  Card,
  spacing,
  Text,
} from '../../../design';
import { useT } from '../../../i18n';
import { RootStackParamList, DeliverySummaryItem } from '../../../navigation/types';
import { useTheme } from '../../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'DeliverySummary'>;

export function DeliverySummaryScreen({ navigation, route }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const { items, totalItems, totalQty } = route.params;

  return (
    <View style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar title={t('deliveryDone')} />

      <FlatList
        data={items}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.hero}>
            <View style={[styles.tick, { backgroundColor: palette.primary }]}>
              <Check size={48} color={palette.onPrimary} strokeWidth={3} />
            </View>
            <Text variant="headlineMedium" style={{ marginTop: spacing.lg, textAlign: 'center' }}>
              {t('deliveryDone')}
            </Text>
            <Text
              variant="bodyLarge"
              color={palette.onSurfaceVariant}
              style={{ marginTop: spacing.sm, textAlign: 'center' }}
            >
              {totalItems} item{totalItems === 1 ? '' : 's'} · {totalQty} total units
            </Text>
            <Text
              variant="bodyMedium"
              color={palette.onSurfaceVariant}
              style={{ marginTop: spacing.xs, textAlign: 'center' }}
            >
              {t('willSyncLater')}
            </Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }: { item: DeliverySummaryItem }) => (
          <Card tone="filled" padding="lg">
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium">{item.name}</Text>
                {item.category && (
                  <Text
                    variant="bodyMedium"
                    color={palette.onSurfaceVariant}
                    style={{ marginTop: 2 }}
                  >
                    {item.category}
                  </Text>
                )}
              </View>
              <Text variant="titleLarge" color={palette.primary}>
                {item.qty}
              </Text>
            </View>
          </Card>
        )}
      />

      <View style={[styles.footer, { backgroundColor: palette.surface, borderTopColor: palette.outlineVariant }]}>
        <Button
          label={t('backHome')}
          size="lg"
          fullWidth
          onPress={() => navigation.popToTop()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  hero: { alignItems: 'center', paddingVertical: spacing.lg, marginBottom: spacing.lg },
  tick: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
  },
});

