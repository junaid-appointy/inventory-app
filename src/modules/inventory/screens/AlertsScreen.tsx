import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check } from 'lucide-react-native';
import { nanoid } from 'nanoid/non-secure';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
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
import { listLowOrOut, statusFor, StockRow, replaceStockFromRemote } from '../../../db/stock';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { api } from '../../../sync/api';
import { flushOnce } from '../../../sync/syncService';
import { haptic } from '../../../utils/haptics';
import { useTheme } from '../../../theme';
import { onCacheStateChange, useCacheStatus } from '../../../sync/cacheStatus';
import { invalidateRefetchThrottle, refetchThrottled } from '../../../sync/refetch';

type Props = NativeStackScreenProps<RootStackParamList, 'Alerts'>;

export function AlertsScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  // Alerts derive from the stock cache (low-or-out is computed from
  // stock_levels). Mirror its status — when stock warms, alerts warm.
  const stockStatus = useCacheStatus('stock');
  const showSkeleton =
    !stockStatus.hasEverBeenWarm &&
    stockStatus.state !== 'error' &&
    stockStatus.state !== 'offline';

  const fetchRemote = useCallback(async () => {
    await flushOnce().catch(() => {});
    const remote = await api.fetch.stock();
    await replaceStockFromRemote(
      remote.map((r) => ({
        barcode: r.barcode,
        name: r.name,
        category: r.category,
        unit: r.unit,
        pack_size: r.pack_size != null ? Number(r.pack_size) : null,
        on_hand: Number(r.on_hand),
        threshold: Number(r.threshold),
      })),
    );
  }, []);

  const readLocal = useCallback(async () => {
    setRows(await listLowOrOut());
  }, []);

  const refresh = useCallback(async () => {
    await refetchThrottled('stock', fetchRemote);
    await readLocal();
  }, [fetchRemote, readLocal]);

  useEffect(() => {
    void readLocal();
    void refresh();
    const unsub = navigation.addListener('focus', () => { void refresh(); });
    const unsubCache = onCacheStateChange('stock', (s) => {
      if (s.state === 'warm') void readLocal();
    });
    return () => { unsub(); unsubCache(); };
  }, [navigation, refresh, readLocal]);

  const onRefresh = useCallback(async () => {
    invalidateRefetchThrottle('stock');
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

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
      {showSkeleton && rows.length === 0 ? (
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
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
                    {item.on_hand}
                    {item.pack_size != null && item.pack_size !== 1 ? ` × ${item.pack_size}` : ''}
                    {item.unit ? ` ${item.unit}` : ''} {t('onHand')} · threshold {item.threshold}
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
