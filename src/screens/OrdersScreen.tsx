import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { AppBar, Card, palette, spacing, StatusPill, Text } from '../design';
import { getOrderItems, listOpenOrders, Order, OrderItem } from '../db/orders';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Orders'>;
type Enriched = Order & { items: OrderItem[] };

export function OrdersScreen({ navigation }: Props) {
  const [orders, setOrders] = useState<Enriched[]>([]);

  const load = useCallback(async () => {
    const list = await listOpenOrders();
    setOrders(
      await Promise.all(list.map(async (o) => ({ ...o, items: await getOrderItems(o.id) })))
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.safe}>
      <AppBar title="Deliveries" subtitle="Expected today" onBack={() => navigation.goBack()} />
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        renderItem={({ item }) => {
          const done = item.items.every((i) => i.received_qty >= i.expected_qty) && item.items.length > 0;
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
                  label={done ? 'Complete' : `${item.items.length} item${item.items.length === 1 ? '' : 's'}`}
                  tone={done ? 'success' : 'neutral'}
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
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  itemRowDivider: { borderBottomWidth: 1, borderBottomColor: palette.outlineVariant },
  empty: { padding: spacing.xxl },
});
