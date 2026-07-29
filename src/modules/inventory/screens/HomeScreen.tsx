import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowRight, Bell, type LucideIcon, HandCoins, Package, ScanLine, Settings as SettingsIcon, Truck } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, IconButton, Skeleton, spacing, Text } from '../../../design';
import { useTheme } from '../../../theme';
import { getSession } from '../../../auth/session';
import { listOpenOrders, upsertOrdersFromRemote } from '../../../db/orders';
import { listLowOrOut, listStock } from '../../../db/stock';
import { pullStockIntoCache } from '../../../sync/stockPull';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { api } from '../../../sync/api';
import { flushOnce } from '../../../sync/syncService';
import { onCacheStateChange, useCacheStatus } from '../../../sync/cacheStatus';
import { invalidateRefetchThrottle, refetchThrottled } from '../../../sync/refetch';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

type Stats = {
  orders: number;
  stock: number;
  alerts: number;
};

export function HomeScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const [stats, setStats] = useState<Stats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Tile loading is driven by cache status, not just `stats === null`.
  // Reading SQLite when the cache is cold returns zeros (empty table),
  // which would render "0" instead of a Skeleton — wrong. Use the
  // hasEverBeenWarm flag so once a cache has succeeded at least once
  // this session, subsequent refreshes don't re-skeleton the tile.
  const stockStatus = useCacheStatus('stock');
  const ordersStatus = useCacheStatus('orders');
  const alertsStatus = useCacheStatus('alerts');
  const stillLoading = (s: { state: string; hasEverBeenWarm: boolean }) =>
    !s.hasEverBeenWarm && s.state !== 'error' && s.state !== 'offline';

  // Stock fetch — pulled out separately so refetchThrottled can manage
  // its cache state. Throws on failure so the state machine sees it.
  const fetchStock = useCallback(async () => {
    await flushOnce().catch(() => {});
    await pullStockIntoCache();
  }, []);

  const fetchOrders = useCallback(async () => {
    const remoteOrders = await api.fetch.orders();
    await upsertOrdersFromRemote(remoteOrders);
  }, []);

  const readLocal = useCallback(async () => {
    const [stock, openOrders, alerts] = await Promise.all([
      listStock(),
      listOpenOrders(),
      listLowOrOut(),
    ]);
    setStats({ stock: stock.length, orders: openOrders.length, alerts: alerts.length });
  }, []);

  // Each tile-relevant cache key gets its own throttled refetch in
  // parallel. Errors flip the per-key state via refetchThrottled; we
  // never throw out of here so the UI stays responsive.
  const refresh = useCallback(async () => {
    await Promise.all([
      refetchThrottled('stock', fetchStock),
      refetchThrottled('orders', fetchOrders),
    ]);
    await readLocal();
  }, [fetchStock, fetchOrders, readLocal]);

  useEffect(() => {
    void readLocal();
    void refresh();
    const unsub = navigation.addListener('focus', () => { void refresh(); });
    // Re-read SQLite whenever another caller (warmCache, post-write
    // invalidation in flushOnce) successfully refreshes one of our
    // upstream caches. Cheap because listStock/listOpenOrders/
    // listLowOrOut are local-only SELECTs.
    const unsubStock = onCacheStateChange('stock', (s) => {
      if (s.state === 'warm') void readLocal();
    });
    const unsubOrders = onCacheStateChange('orders', (s) => {
      if (s.state === 'warm') void readLocal();
    });
    return () => { unsub(); unsubStock(); unsubOrders(); };
  }, [navigation, refresh, readLocal]);

  const onRefresh = useCallback(async () => {
    invalidateRefetchThrottle('stock');
    invalidateRefetchThrottle('orders');
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: palette.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text variant="headlineMedium">
                {t('greeting')}, {getSession()?.guardName ?? ''}
              </Text>
              <Text variant="bodyLarge" color={palette.onSurfaceVariant} style={{ marginTop: spacing.xs }}>
                {t('appName')}
              </Text>
            </View>
            <IconButton Icon={SettingsIcon} onPress={() => navigation.navigate('Settings')} />
          </View>
        </View>

        {/* Hero card — gradient-feel scan CTA */}
        <Pressable
          onPress={() => navigation.navigate('Scanner')}
          style={({ pressed }) => [
            styles.heroCard,
            {
              backgroundColor: pressed ? '#7a2278' : palette.primary,
              shadowColor: palette.primary,
            },
          ]}
        >
          <View style={styles.heroIcon}>
            <ScanLine size={30} color="#fff" strokeWidth={2.2} />
          </View>
          <Text variant="headlineMedium" color="#fff" style={{ marginTop: spacing.lg, fontWeight: '800', letterSpacing: -0.5 }}>
            {t('startScanning')}
          </Text>
          <Text variant="bodyMedium" color="rgba(255,255,255,0.85)" style={{ marginTop: spacing.xxs }}>
            {t('scanItem')}
          </Text>
        </Pressable>

        <View style={styles.tilesRow}>
          <Tile
            label={t('receiving')}
            value={stats?.orders}
            loading={stillLoading(ordersStatus) || stats === null}
            sub={t('expectedToday')}
            Icon={Truck}
            onPress={() => navigation.navigate('Orders')}
          />
          <Tile
            label={t('stock')}
            value={stats?.stock}
            loading={stillLoading(stockStatus) || stats === null}
            sub={t('stockSub')}
            Icon={Package}
            onPress={() => navigation.navigate('Stock')}
          />
        </View>

        <View style={styles.tilesRow}>
          <Tile
            label={t('dispense')}
            sub={t('dispenseSub')}
            Icon={HandCoins}
            onPress={() => navigation.navigate('Dispense')}
            valueSlot={
              <View style={{ height: 40, marginTop: spacing.xs, justifyContent: 'center' }}>
                <ArrowRight size={30} color={palette.primary} strokeWidth={2} />
              </View>
            }
          />
          <Tile
            label={t('alerts')}
            value={stats?.alerts || undefined}
            loading={stillLoading(alertsStatus) || stats === null}
            sub={t('alertsSub')}
            Icon={Bell}
            tone={stats && stats.alerts > 0 ? 'warn' : 'neutral'}
            onPress={() => navigation.navigate('Alerts')}
            cardStyle={stats && stats.alerts > 0 ? { backgroundColor: '#FFF8E1' } : undefined}
          />
        </View>

        {/* No sync tile. Sync is not a task the user performs — it runs
            on its own (30s push, 5min read pull, plus an immediate flush
            when connectivity returns) and asking a guard to think about
            a queue is asking them to do the system's job. The screen
            still exists behind Settings for when something actually
            fails; see SettingsScreen. */}
      </ScrollView>
    </SafeAreaView>
  );
}

type TileProps = {
  label: string;
  value?: number;
  loading?: boolean;
  sub: string;
  Icon: LucideIcon;
  tone?: 'neutral' | 'warn';
  trailing?: React.ReactNode;
  valueSlot?: React.ReactNode;
  cardStyle?: ViewStyle;
  onPress: () => void;
};

function Tile({ label, value, loading, sub, Icon, tone = 'neutral', trailing, valueSlot, cardStyle, onPress }: TileProps) {
  const { palette } = useTheme();
  const iconColor = tone === 'warn' ? '#F9A825' : palette.primary;
  const valueColor = tone === 'warn' ? '#c98b00' : palette.onSurface;
  return (
    <Card tone="elevated" onPress={onPress} style={[styles.tile, cardStyle]}>
      <View style={styles.tileHeader}>
        <Text variant="labelLarge" color={tone === 'warn' ? '#8a6d00' : palette.onSurfaceVariant}>
          {label.toUpperCase()}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {trailing}
          <Icon size={22} color={iconColor} strokeWidth={2.2} />
        </View>
      </View>
      {loading ? (
        <View style={{ marginTop: spacing.xs, marginBottom: spacing.xs }}>
          <Skeleton width={64} height={36} />
        </View>
      ) : valueSlot ? (
        valueSlot
      ) : value !== undefined ? (
        <Text
          variant="displayMedium"
          color={valueColor}
          style={{ marginTop: spacing.xs }}
        >
          {value}
        </Text>
      ) : (
        <View style={{ height: spacing.md }} />
      )}
      <Text variant="bodyMedium" color={tone === 'warn' ? '#8a6d00' : palette.onSurfaceVariant}>
        {sub}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  heroCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    borderRadius: 24,
    padding: spacing.xl,
    shadowOpacity: 0.3,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tilesRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  tile: { flex: 1 },
  tileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
