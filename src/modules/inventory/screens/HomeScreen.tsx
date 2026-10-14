import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HandCoins, Search, Truck } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useCan } from '../../../auth';
import { NavRow } from '../../../components/NavRow';
import { HubLayout } from '../../../components/shell/HubLayout';
import { listOpenOrders, upsertOrdersFromRemote } from '../../../db/orders';
import { listStock, statusFor, type StockRow } from '../../../db/stock';
import { Button, IconBadge, ListRow, RowDivider, SectionHeader, Skeleton, spacing, StatusChip, Text } from '../../../design';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { api } from '../../../sync/api';
import { onCacheStateChange } from '../../../sync/cacheStatus';
import { invalidateRefetchThrottle, refetchThrottled } from '../../../sync/refetch';
import { pullStockIntoCache } from '../../../sync/stockPull';
import { flushOnce } from '../../../sync/syncService';
import { useTheme } from '../../../theme';
import { formatOnHandShort } from '../../../units';
import { categoryIcon } from '../categoryIcon';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const URGENCY = { out: 0, low: 1, ok: 2 } as const;
const SHOWN = 6;

/**
 * Inventory hub (design 05): search, the two everyday tasks as cards, and
 * the few items that matter most right now (out and low first). The full
 * list lives behind "See all". Scanning is the bottom bar's job.
 */
export function HomeScreen({ navigation }: Props) {
  const t = useT();
  const can = useCan();
  const { palette } = useTheme();
  const [items, setItems] = useState<StockRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [orders, setOrders] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const readLocal = useCallback(async () => {
    const [stock, open] = await Promise.all([listStock(), listOpenOrders()]);
    const sorted = [...stock].sort((a, b) => URGENCY[statusFor(a)] - URGENCY[statusFor(b)] || a.name.localeCompare(b.name));
    setItems(sorted.slice(0, SHOWN));
    setTotal(stock.length);
    setOrders(open.length);
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([
      refetchThrottled('stock', async () => {
        await flushOnce().catch(() => {});
        await pullStockIntoCache();
      }),
      refetchThrottled('orders', async () => {
        await upsertOrdersFromRemote(await api.fetch.orders());
      }),
    ]);
    await readLocal();
  }, [readLocal]);

  useEffect(() => {
    void readLocal();
    void refresh();
    const unsub = navigation.addListener('focus', () => { void refresh(); });
    // Re-read SQLite when a background sync refreshes the caches.
    const unsubStock = onCacheStateChange('stock', (s) => { if (s.state === 'warm') void readLocal(); });
    const unsubOrders = onCacheStateChange('orders', (s) => { if (s.state === 'warm') void readLocal(); });
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
    <HubLayout title={t('tabInventory')} refreshing={refreshing} onRefresh={onRefresh}>
      <Pressable
        onPress={() => navigation.navigate('Stock', { focusSearch: true })}
        style={[styles.search, { borderColor: palette.outlineVariant, backgroundColor: palette.surfaceContainerLow }]}
        accessibilityRole="search"
      >
        <Search size={22} color={palette.onSurfaceVariant} />
        <Text variant="bodyLarge" color={palette.onSurfaceVariant}>
          {t('searchItem')}
        </Text>
      </Pressable>

      {/* Tasks, not items: outlined cards, like the tasks on Today.
          Scanning is the bottom bar's job ("Scan item" on this page). */}
      {can('inventory.receive') || can('inventory.issue') ? (
        <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
          {can('inventory.receive') ? (
            <NavRow
              Icon={Truck}
              label={t('receiveAction')}
              detail={orders > 0 ? t('nDeliveriesExpected', { n: orders }) : t('deliveriesSub')}
              onPress={() => navigation.navigate('Orders')}
            />
          ) : null}
          {can('inventory.issue') ? (
            <NavRow Icon={HandCoins} label={t('takeOutAction')} onPress={() => navigation.navigate('Dispense')} />
          ) : null}
        </View>
      ) : null}

      {/* Everything below the heading is an item; "See all" sits with the
          heading where people look for "more of this list". */}
      <SectionHeader
        title={t('itemsSection')}
        actionLabel={total ? t('seeAllCount', { n: total }) : t('viewAll')}
        onAction={() => navigation.navigate('Stock')}
      />
      <View>
        {items === null
          ? [0, 1, 2].map((i) => (
            <View key={i} style={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.md }}>
              <Skeleton height={52} />
            </View>
          ))
          : items.map((row, i) => {
            const status = statusFor(row);
            return (
              <View key={row.barcode}>
                {i > 0 ? <RowDivider /> : null}
                <ListRow
                  leading={<IconBadge Icon={categoryIcon(row.category)} size={52} />}
                  title={row.name}
                  subtitle={formatOnHandShort(row.on_hand, row.pack_size, row.unit)}
                  trailing={
                    <StatusChip
                      label={status === 'out' ? t('outOfStock') : status === 'low' ? t('lowChip') : t('inStockChip')}
                      tone={status === 'out' ? 'danger' : status === 'low' ? 'warn' : 'success'}
                    />
                  }
                  onPress={() => navigation.navigate('Stock', { expandBarcode: row.barcode })}
                />
              </View>
            );
          })}
      </View>

    </HubLayout>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 56,
    marginHorizontal: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
  },
});
