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
  Text,
} from '../../../design';
import { enqueue } from '../../../db/outbox';
import { listLowOrOut, statusFor, StockRow } from '../../../db/stock';
import { pullStockIntoCache } from '../../../sync/stockPull';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
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
  // False until the first local read resolves — stops the "All stocked
  // up" empty state flashing before readLocal() returns.
  const [loadedLocal, setLoadedLocal] = useState(false);
  // Alerts derive from the stock cache (low-or-out is computed from
  // stock_levels). Mirror its status — when stock warms, alerts warm.
  const stockStatus = useCacheStatus('stock');
  const showSkeleton =
    !loadedLocal ||
    (!stockStatus.hasEverBeenWarm &&
      stockStatus.state !== 'error' &&
      stockStatus.state !== 'offline');

  const fetchRemote = useCallback(async () => {
    await flushOnce().catch(() => {});
    await pullStockIntoCache();
  }, []);

  const readLocal = useCallback(async () => {
    setRows(await listLowOrOut());
    setLoadedLocal(true);
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
          const isOut = status === 'out';
          const label = isOut ? t('outStock') : t('lowStock');
          const done = requested.has(item.barcode);
          // Design: red bg for OUT, amber bg for LOW
          const alertCardBg = isOut ? '#FFEBEE' : '#FFF8E1';
          // Bold pill: solid red/amber bg
          const pillBg = isOut ? '#E53935' : '#F9A825';
          const pillFg = isOut ? '#fff' : '#3d2c00';
          return (
            <Card
              tone="elevated"
              padding="lg"
              style={{ backgroundColor: alertCardBg }}
              onPress={() => navigation.navigate('Stock', { expandBarcode: item.barcode })}
            >
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleMedium" style={{ fontWeight: '800', fontSize: 18 }}>{item.name}</Text>
                  <Text
                    variant="bodyMedium"
                    color="rgba(30,26,29,0.6)"
                    style={{ marginTop: 2 }}
                  >
                    {item.on_hand} {t('onHand')} · threshold {item.threshold}
                  </Text>
                </View>
                <View style={{
                  borderRadius: 999,
                  backgroundColor: pillBg,
                  paddingHorizontal: 13,
                  paddingVertical: 6,
                }}>
                  <Text variant="labelLarge" color={pillFg} style={{ fontWeight: '700' }}>
                    {label}
                  </Text>
                </View>
              </View>
              <View style={{ height: spacing.md }} />
              {done ? (
                <Button
                  label={t('reorderSent')}
                  variant="tonal"
                  size="md"
                  leadingIcon={<Check size={18} color="#2E7D32" strokeWidth={2.6} />}
                  style={{ backgroundColor: '#E8F5E9' }}
                  disabled
                  onPress={() => {}}
                />
              ) : (
                <Button
                  label={t('requestReorder')}
                  variant={isOut ? 'outlined' : 'tonal'}
                  size="md"
                  onPress={() => reorder(item)}
                  style={isOut ? { borderColor: '#E53935' } : undefined}
                />
              )}
            </Card>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="headlineSmall" style={{ textAlign: 'center' }}>
              {t('allStockedUp')}
            </Text>
            <Text
              variant="bodyLarge"
              color={palette.onSurfaceVariant}
              style={{ textAlign: 'center', marginTop: spacing.sm }}
            >
              {t('nothingBelowThreshold')}
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
