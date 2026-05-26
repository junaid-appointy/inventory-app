import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { AppBar, Card, palette, Skeleton, spacing, StatusPill, Text } from '../../../design';
import { getOrderItems, listOpenOrders, Order, OrderItem } from '../../../db/orders';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { api } from '../../../sync/api';
import { flushOnce } from '../../../sync/syncService';

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

export function OrdersScreen({ navigation }: Props) {
  const t = useT();
  const [orders, setOrders] = useState<Enriched[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  const load = useCallback(async () => {
    // Flush pending writes (e.g. receipts that updated received_qty) so
    // the orders list reflects them on the very first remote fetch.
    await flushOnce().catch(() => {});

    // Prefer remote when available — orders are managed server-side.
    try {
      const remote = await api.fetch.orders();
      setOrders(
        remote.map((o) => ({
          id: o.id,
          vendor: o.vendor,
          expected_at: o.expected_at ? new Date(o.expected_at).getTime() : null,
          status: o.status,
          updated_at: Date.now(),
          items: o.items.map((i) => ({
            id: i.id,
            order_id: i.order_id,
            barcode: i.barcode,
            product_name: i.product_name,
            expected_qty: Number(i.expected_qty),
            received_qty: Number(i.received_qty),
          })),
        })),
      );
      setInitialLoading(false);
      return;
    } catch {
      // Offline / unauthenticated — fall through to local cache.
    }
    const list = await listOpenOrders();
    setOrders(
      await Promise.all(list.map(async (o) => ({ ...o, items: await getOrderItems(o.id) })))
    );
    setInitialLoading(false);
  }, []);

  useEffect(() => {
    load();
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const sections = useMemo(() => {
    const groups: Record<Bucket, Enriched[]> = { arrived: [], awaited: [], done: [] };
    for (const o of orders) groups[bucketOf(o)].push(o);
    const titleFor: Record<Bucket, string> = {
      arrived: 'Arrived',
      awaited: t('awaited'),
      done: t('doneToday'),
    };
    return SECTION_ORDER.filter((b) => groups[b].length > 0).map((b) => ({
      title: titleFor[b],
      bucket: b,
      data: groups[b],
    }));
  }, [orders, t]);

  return (
    <View style={styles.safe}>
      <AppBar title={t('receiving')} subtitle={t('expectedToday')} onBack={() => navigation.goBack()} />
      {initialLoading && orders.length === 0 ? (
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
      <SectionList
        sections={sections}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text variant="labelLarge" color={palette.onSurfaceVariant}>
              {section.title.toUpperCase()} · {section.data.length}
            </Text>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        SectionSeparatorComponent={() => <View style={{ height: spacing.lg }} />}
        renderItem={({ item, section }) => {
          const bucket = (section as unknown as { bucket: Bucket }).bucket;
          return (
            <Card tone="filled" padding="lg">
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleLarge">{item.vendor ?? 'Order'}</Text>
                  {item.expected_at ? (
                    <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.xs }}>
                      Due {new Date(item.expected_at).toLocaleDateString()}
                    </Text>
                  ) : null}
                </View>
                <StatusPill
                  label={
                    bucket === 'done'
                      ? t('done')
                      : `${item.items.length} ${t('items')}`
                  }
                  tone={bucket === 'done' ? 'success' : bucket === 'arrived' ? 'warn' : 'neutral'}
                />
              </View>

              <View style={{ height: spacing.md }} />
              {item.items.map((i, idx) => {
                const itemDone = i.received_qty >= i.expected_qty;
                return (
                  <View
                    key={i.id}
                    style={[
                      styles.itemRow,
                      idx < item.items.length - 1 && styles.itemRowDivider,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyLarge" color={itemDone ? palette.onSurfaceVariant : palette.onSurface}>
                        {i.product_name}
                      </Text>
                    </View>
                    <Text
                      variant="titleMedium"
                      color={itemDone ? palette.primary : palette.onSurface}
                    >
                      {i.received_qty} / {i.expected_qty}
                    </Text>
                  </View>
                );
              })}
            </Card>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="headlineSmall" style={{ textAlign: 'center' }}>
              No deliveries scheduled
            </Text>
            <Text
              variant="bodyLarge"
              color={palette.onSurfaceVariant}
              style={{ textAlign: 'center', marginTop: spacing.sm }}
            >
              Orders appear here once the office processes a bill.
            </Text>
          </View>
        }
      />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  sectionHeader: { paddingBottom: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  itemRowDivider: { borderBottomWidth: 1, borderBottomColor: palette.outlineVariant },
  empty: { padding: spacing.xxl },
});
