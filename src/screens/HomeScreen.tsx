import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QueueBadge } from '../components/QueueBadge';
import { Button, Card, palette, spacing, Text } from '../design';
import { listProducts } from '../db/products';
import { listOpenOrders } from '../db/orders';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const [stats, setStats] = useState({ products: 0, orders: 0 });

  useEffect(() => {
    const load = async () => {
      const [p, o] = await Promise.all([listProducts(1000), listOpenOrders()]);
      setStats({ products: p.length, orders: o.length });
    };
    load();
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation]);

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <Text variant="labelLarge" color={palette.onSurfaceVariant}>
          GATE ENTRY
        </Text>
        <Text variant="displayMedium" style={{ marginTop: spacing.xs }}>
          Field
        </Text>
        <View style={{ marginTop: spacing.md }}>
          <QueueBadge />
        </View>
      </View>

      <View style={styles.primary}>
        <Button
          label="Scan item"
          leadingIcon={<Text variant="headlineSmall" color={palette.onPrimary}>⌖</Text>}
          size="xl"
          fullWidth
          onPress={() => navigation.navigate('Scanner')}
        />
        <Text
          variant="bodyMedium"
          color={palette.onSurfaceVariant}
          style={{ textAlign: 'center', marginTop: spacing.md }}
        >
          Point camera at a barcode. We'll do the rest.
        </Text>
      </View>

      <View style={styles.tiles}>
        <Card
          tone="filled"
          onPress={() => navigation.navigate('Orders')}
          style={styles.tile}
        >
          <Text variant="labelLarge" color={palette.onSurfaceVariant}>
            DELIVERIES
          </Text>
          <Text variant="displayMedium" style={{ marginTop: spacing.xs }}>
            {stats.orders}
          </Text>
          <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
            expected today
          </Text>
        </Card>
        <Card
          tone="filled"
          onPress={() => navigation.navigate('Outbox')}
          style={styles.tile}
        >
          <Text variant="labelLarge" color={palette.onSurfaceVariant}>
            CATALOG
          </Text>
          <Text variant="displayMedium" style={{ marginTop: spacing.xs }}>
            {stats.products}
          </Text>
          <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
            products mapped
          </Text>
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  primary: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  tiles: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  tile: { flex: 1 },
});
