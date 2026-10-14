import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, ScanLine } from 'lucide-react-native';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { AppBar, Appear, Button, Card, ProgressBar, Skeleton, spacing, StatusPill, Text } from '../../../design';
import { findBarcodeForProduct, findCanonicalProductById } from '../../../db/catalog';
import { getOrderItems, listOpenOrders, Order, OrderItem, upsertOrdersFromRemote } from '../../../db/orders';
import { haptic } from '../../../utils/haptics';
import { resolveBarcodeRoute } from '../barcodeRoute';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { api } from '../../../sync/api';
import { flushOnce } from '../../../sync/syncService';
import { useTheme } from '../../../theme';
import { onCacheStateChange, useCacheStatus } from '../../../sync/cacheStatus';
import { invalidateRefetchThrottle, refetchThrottled } from '../../../sync/refetch';

type Props = NativeStackScreenProps<RootStackParamList, 'Orders'>;
type Enriched = Order & { items: OrderItem[] };
type Bucket = 'arrived' | 'awaited' | 'done';

function bucketOf(o: Enriched): Bucket {
  if (o.items.length === 0) return 'awaited';
  const allDone = o.items.every((i) => i.received_qty >= i.expected_qty);
  if (allDone) return 'done';
  const anyReceived = o.items.some((i) => i.received_qty > 0);
  return anyReceived ? 'arrived' : 'awaited';
}

const SECTION_ORDER: Bucket[] = ['arrived', 'awaited', 'done'];

/** One list entry: a section heading or an order card. */
type ListRow =
  | { kind: 'header'; key: string; title: string; count: number; first: boolean }
  | { kind: 'order'; key: string; order: Enriched; bucket: Bucket };
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "26 May 2026": the same in every language, like the rest of the app's dates. */
function dayText(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** Rows shown on a closed card; the rest open with one tap. */
const PREVIEW_ROWS = 3;

export function OrdersScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const [orders, setOrders] = useState<Enriched[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  /**
   * Receive one line straight from the list, the same screen a scan opens.
   * Matched lines go to their product; an unmatched line with a barcode
   * resolves like a scan; anything else lets the guard pick the product.
   */
  const receiveLine = useCallback(
    async (line: OrderItem) => {
      haptic.tap();
      const product = line.product_id ? await findCanonicalProductById(line.product_id).catch(() => null) : null;
      if (product) {
        const barcode =
          line.barcode ??
          product.primary_barcode ??
          (await findBarcodeForProduct(product.product_id).catch(() => null)) ??
          `catalog_${product.product_id}`;
        navigation.navigate('Receiving', {
          barcode,
          productId: product.product_id,
          productName: product.canonical_name,
          unit: product.unit,
          packSize: product.pack_size,
        });
        return;
      }
      if (line.barcode) {
        const next = await resolveBarcodeRoute(line.barcode);
        if (next.name === 'Receiving') navigation.navigate('Receiving', next.params);
        else navigation.navigate('RegisterProduct', next.params);
        return;
      }
      navigation.navigate('CatalogPicker', undefined);
    },
    [navigation],
  );
  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  // False until the first local read resolves. Without this the empty
  // state flashes: warmCache() flips hasEverBeenWarm at login (before this
  // screen mounts), so the skeleton is already suppressed while `orders`
  // is still [] for the frame before readLocal() returns.
  const [loadedLocal, setLoadedLocal] = useState(false);
  const ordersStatus = useCacheStatus('orders');
  const showSkeleton =
    !loadedLocal ||
    (!ordersStatus.hasEverBeenWarm &&
      ordersStatus.state !== 'error' &&
      ordersStatus.state !== 'offline');

  const fetchRemote = useCallback(async () => {
    await flushOnce().catch(() => {});
    const remote = await api.fetch.orders();
    await upsertOrdersFromRemote(remote).catch(() => {});
  }, []);

  const readLocal = useCallback(async () => {
    const list = await listOpenOrders();
    setOrders(
      await Promise.all(list.map(async (o) => ({ ...o, items: await getOrderItems(o.id) })))
    );
    setLoadedLocal(true);
  }, []);

  const refresh = useCallback(async () => {
    await refetchThrottled('orders', fetchRemote);
    await readLocal();
  }, [fetchRemote, readLocal]);

  useEffect(() => {
    void readLocal();
    void refresh();
    const unsub = navigation.addListener('focus', () => { void refresh(); });
    const unsubCache = onCacheStateChange('orders', (s) => {
      if (s.state === 'warm') void readLocal();
    });
    return () => { unsub(); unsubCache(); };
  }, [navigation, refresh, readLocal]);

  const onRefresh = useCallback(async () => {
    invalidateRefetchThrottle('orders');
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const listRows = useMemo(() => {
    const groups: Record<Bucket, Enriched[]> = { arrived: [], awaited: [], done: [] };
    for (const o of orders) groups[bucketOf(o)].push(o);
    // Newest bill first: today's delivery is the one being looked for.
    for (const b of SECTION_ORDER) groups[b].sort((a, z) => (z.expected_at ?? 0) - (a.expected_at ?? 0));
    const titleFor: Record<Bucket, string> = {
      arrived: t('partlyReceived'),
      awaited: t('awaited'),
      done: t('doneToday'),
    };
    const rows: ListRow[] = [];
    for (const b of SECTION_ORDER) {
      if (groups[b].length === 0) continue;
      rows.push({ kind: 'header', key: `h:${b}`, title: titleFor[b], count: groups[b].length, first: rows.length === 0 });
      for (const o of groups[b]) rows.push({ kind: 'order', key: o.id, order: o, bucket: b });
    }
    return rows;
  }, [orders, t]);

  return (
    <View style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar title={t('receiving')} subtitle={t('expectedToday')} onBack={() => navigation.goBack()} />
      {showSkeleton && orders.length === 0 ? (
        <View style={styles.list}>
          <View style={[styles.sectionHeader, { marginBottom: spacing.sm }]}>
            <Skeleton width="35%" height={14} />
          </View>
          {[0, 1].map((i) => (
            <View key={i} style={{ marginBottom: spacing.md }}>
              <Card tone="filled" padding="lg">
                <View style={styles.head}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Skeleton width="50%" height={22} />
                    <Skeleton width="35%" height={14} />
                  </View>
                  <Skeleton width={64} height={24} rounded="pill" />
                </View>
                <View style={{ height: spacing.md }} />
                <Skeleton width="100%" height={16} />
                <View style={{ height: spacing.sm }} />
                <Skeleton width="80%" height={16} />
              </Card>
            </View>
          ))}
        </View>
      ) : (
      <FlatList
        data={listRows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
        extraData={expanded}
        renderItem={({ item: entry, index }) => {
          if (entry.kind === 'header') {
            return (
              <View style={[styles.sectionHeader, !entry.first && { marginTop: spacing.lg }]}>
                <Text variant="labelLarge" color={palette.onSurfaceVariant}>
                  {entry.title} · {entry.count}
                </Text>
              </View>
            );
          }
          return (
            <OrderCard
              order={entry.order}
              bucket={entry.bucket}
              open={expanded.has(entry.order.id)}
              index={index}
              onToggle={toggle}
              onReceive={receiveLine}
            />
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="headlineSmall" style={{ textAlign: 'center' }}>
              {t('noDeliveries')}
            </Text>
            <Text
              variant="bodyLarge"
              color={palette.onSurfaceVariant}
              style={{ textAlign: 'center', marginTop: spacing.sm }}
            >
              {t('ordersAppearHint')}
            </Text>
          </View>
        }
      />
      )}
      {/* The one thing to do here: scan what arrived. */}
      <View style={[styles.footer, { backgroundColor: palette.background, borderTopColor: palette.outlineVariant }]}>
        <Button
          label={t('scanItemAction')}
          onPress={() => navigation.navigate('Scanner')}
          size="lg"
          fullWidth
          Icon={ScanLine}
        />
      </View>
    </View>
  );
}

/**
 * One order. Memoised: opening or closing an order redraws only that card.
 * Kept light for cheap phones: the extra lines fade in as one block (no
 * per-line animation), and lines use a plain pressed colour.
 */
const OrderCard = React.memo(function OrderCard({
  order: item,
  bucket,
  open,
  index,
  onToggle,
  onReceive,
}: {
  order: Enriched;
  bucket: Bucket;
  open: boolean;
  index: number;
  onToggle: (id: string) => void;
  onReceive: (line: OrderItem) => void;
}) {
  const t = useT();
  const { palette } = useTheme();
  const total = item.items.length;
  const doneCount = item.items.filter((i) => i.received_qty >= i.expected_qty).length;
  // Still to come first: that is what the guard is looking for.
  const rows = useMemo(
    () => [...item.items].sort((a, b) => Number(a.received_qty >= a.expected_qty) - Number(b.received_qty >= b.expected_qty)),
    [item.items],
  );
  const canOpen = rows.length > PREVIEW_ROWS;
  const hidden = rows.length - PREVIEW_ROWS;

  const line = (i: OrderItem, last: boolean) => {
    const itemDone = i.received_qty >= i.expected_qty;
    return (
      <Pressable
        key={i.id}
        onPress={() => onReceive(i)}
        accessibilityRole="button"
        accessibilityLabel={`${i.product_name}, ${i.received_qty} / ${i.expected_qty}`}
        style={({ pressed }) => [
          styles.itemRow,
          !last && { borderBottomWidth: 1, borderBottomColor: palette.outlineVariant },
          pressed && { backgroundColor: palette.surfaceContainerHigh },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text variant="bodyLarge" numberOfLines={2} color={itemDone ? palette.onSurfaceVariant : palette.onSurface}>
            {i.product_name}
          </Text>
        </View>
        <Text variant="titleMedium" color={itemDone ? palette.primary : palette.onSurface}>
          {i.received_qty} / {i.expected_qty}
        </Text>
        {itemDone ? (
          <CheckCircle2 size={20} color={palette.primary} />
        ) : (
          <ChevronRight size={20} color={palette.onSurfaceVariant} />
        )}
      </Pressable>
    );
  };

  const card = (
    <Card tone="filled" padding="lg">
      <Pressable
        onPress={canOpen ? () => onToggle(item.id) : undefined}
        disabled={!canOpen}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.head}
      >
        <View style={{ flex: 1 }}>
          <Text variant="titleLarge" numberOfLines={2}>{item.vendor ?? 'Order'}</Text>
          {item.expected_at ? (
            <View style={styles.dateRow}>
              <CalendarDays size={16} color={palette.onSurfaceVariant} />
              <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
                {t('billDated', { date: dayText(item.expected_at) })}
              </Text>
            </View>
          ) : null}
        </View>
        {bucket === 'done' ? <StatusPill label={t('done')} tone="success" /> : null}
        {canOpen ? (
          open ? <ChevronUp size={24} color={palette.onSurfaceVariant} /> : <ChevronDown size={24} color={palette.onSurfaceVariant} />
        ) : null}
      </Pressable>

      {total > 0 && bucket !== 'done' ? (
        <View style={styles.progress}>
          <ProgressBar fill={doneCount / total} color={palette.primary} track={palette.surfaceContainerHighest} />
          <Text variant="labelLarge" color={palette.onSurfaceVariant}>
            {t('receivedOfTotal', { done: String(doneCount), total: String(total) })}
          </Text>
        </View>
      ) : null}

      <View style={{ height: spacing.sm }} />
      {rows.slice(0, PREVIEW_ROWS).map((i, idx) => line(i, idx === Math.min(rows.length, PREVIEW_ROWS) - 1 && !canOpen))}
      {open ? (
        // The rest fade in together: one animated view, however many lines.
        <Reanimated.View entering={FadeIn.duration(140)}>
          {rows.slice(PREVIEW_ROWS).map((i) => line(i, false))}
        </Reanimated.View>
      ) : null}
      {canOpen ? (
        <Pressable
          onPress={() => onToggle(item.id)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.more, pressed && { opacity: 0.6 }]}
          hitSlop={8}
        >
          <Text variant="labelLarge" color={palette.primary} numberOfLines={1} style={{ fontWeight: '700', flexShrink: 0 }}>
            {open ? t('showFewerItems') : t('showMoreItems', { n: String(hidden) })}
          </Text>
          {open ? <ChevronUp size={18} color={palette.primary} /> : <ChevronDown size={18} color={palette.primary} />}
        </Pressable>
      ) : null}
    </Card>
  );

  // The first cards lift in once when the screen opens.
  return index < 8 ? (
    <Appear delay={Math.min(index, 6) * 40} style={styles.cardWrap}>
      {card}
    </Appear>
  ) : (
    <View style={styles.cardWrap}>{card}</View>
  );
});

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  sectionHeader: { paddingBottom: spacing.sm },
  cardWrap: { marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  progress: { marginTop: spacing.md, gap: spacing.xs },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingTop: spacing.md },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  empty: { padding: spacing.xxl },
});
