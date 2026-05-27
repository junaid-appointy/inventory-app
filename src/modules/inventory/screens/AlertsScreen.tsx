import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check } from 'lucide-react-native';
import { nanoid } from 'nanoid/non-secure';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  AppBar,
  Button,
  Card,
  Skeleton,
  spacing,
  StatusPill,
  Text,
} from '../../../design';
import { enqueue } from '../../../db/outbox';
import { listLowOrOut, statusFor, StockRow, syncStockFromRemote } from '../../../db/stock';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { api } from '../../../sync/api';
import { flushOnce } from '../../../sync/syncService';
import { haptic } from '../../../utils/haptics';
import { useTheme } from '../../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Alerts'>;

export function AlertsScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [initialLoading, setInitialLoading] = useState(true);

  const load = useCallback(async () => {
    // Flush pending writes first so the remote reflects the latest state.
    await flushOnce().catch(() => {});
    try {
      const remote = await api.fetch.alerts();
      await Promise.all(
        remote.map((r) =>
          syncStockFromRemote({
            barcode: r.barcode,
            name: r.name,
            category: r.category,
            unit: r.unit,
            on_hand: Number(r.on_hand),
            threshold: Number(r.threshold),
          }),
        ),
      );
    } catch {
      // Fall back to local SQLite cache.
    }
    setRows(await listLowOrOut());
    setInitialLoading(false);
  }, []);

  useEffect(() => {
    load();
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const reorder = async (row: StockRow) => {
    haptic.tap();
    await enqueue('reorder_request', {
      id: `ror_${nanoid(12)}`,
      barcode: row.barcode,
      product_name: row.name,
      on_hand: row.on_hand,
      threshold: row.threshold,
      requested_at: Date.now(),
    });
    setRequested((prev) => new Set(prev).add(row.barcode));
    flushOnce().catch(() => {});
    haptic.success();
  };

  return (
    <View style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar title={t('alerts')} subtitle={t('alertsSub')} onBack={() => navigation.goBack()} />
      {initialLoading && rows.length === 0 ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ marginBottom: spacing.md }}>
              <Card tone="filled" padding="lg">
                <View style={styles.head}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Skeleton width="55%" height={18} />
                    <Skeleton width="75%" height={14} />
                  </View>
                  <Skeleton width={56} height={24} rounded="pill" />
                </View>
                <View style={{ height: spacing.md }} />
                <Skeleton width="40%" height={36} rounded="pill" />
              </Card>
            </View>
          ))}
        </View>
      ) : (
      <FlatList
        data={rows}
        keyExtractor={(r) => r.barcode}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        renderItem={({ item }) => {
          const status = statusFor(item);
          const tone = status === 'out' ? 'danger' : 'warn';
          const label = status === 'out' ? t('outStock') : t('lowStock');
          const done = requested.has(item.barcode);
          return (
            <Card tone="filled" padding="lg">
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleMedium">{item.name}</Text>
                  <Text
                    variant="bodyMedium"
                    color={palette.onSurfaceVariant}
                    style={{ marginTop: 2 }}
                  >
                    {item.on_hand} {item.unit ?? ''} {t('onHand')} · threshold {item.threshold}
                  </Text>
                </View>
                <StatusPill label={label} tone={tone} />
              </View>
              <View style={{ height: spacing.md }} />
              {done ? (
                <StatusPill label={t('reorderSent')} tone="success" Icon={Check} />
              ) : (
                <Button
                  label={t('requestReorder')}
                  variant="tonal"
                  size="md"
                  onPress={() => reorder(item)}
                />
              )}
            </Card>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="headlineSmall" style={{ textAlign: 'center' }}>
              All stocked up
            </Text>
            <Text
              variant="bodyLarge"
              color={palette.onSurfaceVariant}
              style={{ textAlign: 'center', marginTop: spacing.sm }}
            >
              Nothing is below its threshold right now.
            </Text>
          </View>
        }
      />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  empty: { padding: spacing.xxl },
});
