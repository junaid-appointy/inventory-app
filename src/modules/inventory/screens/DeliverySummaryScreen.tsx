import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AlertTriangle, Check } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  AppBar,
  Button,
  Card,
  palette,
  spacing,
  StatusPill,
  Text,
} from '../../../design';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DeliverySummary'>;

export function DeliverySummaryScreen({ navigation, route }: Props) {
  const t = useT();
  const { productName, qty, expected, flagged } = route.params;
  const matched = expected !== null && qty === expected;

  return (
    <View style={styles.safe}>
      <AppBar title={t('deliveryDone')} />
      <View style={styles.body}>
        <View style={styles.hero}>
          <View style={styles.tick}>
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
            {t('willSyncLater')}
          </Text>
        </View>

        <Card tone="elevated" padding="xl">
          <Text variant="labelLarge" color={palette.onSurfaceVariant}>
            PRODUCT
          </Text>
          <Text variant="titleLarge" style={{ marginTop: spacing.xs }}>
            {productName}
          </Text>
          <View style={styles.rowBetween}>
            <Text variant="bodyLarge" color={palette.onSurfaceVariant}>
              {t('scanned')}
            </Text>
            <Text variant="titleMedium">{qty}</Text>
          </View>
          {expected !== null && (
            <View style={styles.rowBetween}>
              <Text variant="bodyLarge" color={palette.onSurfaceVariant}>
                {t('expected')}
              </Text>
              <Text variant="titleMedium">{expected}</Text>
            </View>
          )}
          <View style={{ marginTop: spacing.md }}>
            {flagged ? (
              <StatusPill label={t('mismatch')} tone="danger" Icon={AlertTriangle} />
            ) : matched ? (
              <StatusPill label="Counts match" tone="success" Icon={Check} />
            ) : (
              <StatusPill label="Standalone receipt" tone="neutral" />
            )}
          </View>
        </Card>
      </View>

      <View style={styles.footer}>
        <Button
          label={t('startScanning')}
          variant="tonal"
          size="lg"
          fullWidth
          onPress={() => navigation.replace('Scanner')}
        />
        <Button
          label={t('backHome')}
          variant="text"
          onPress={() => navigation.popToTop()}
          style={{ marginTop: spacing.sm }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  body: { flex: 1, padding: spacing.xl, gap: spacing.xl },
  hero: { alignItems: 'center', paddingVertical: spacing.lg },
  tick: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  footer: {
    padding: spacing.xl,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.outlineVariant,
  },
});
