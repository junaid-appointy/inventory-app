import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, palette, spacing, Text } from '../../../design';
import { listOpenOrders } from '../../../db/orders';
import { listProducts } from '../../../db/products';
import { listLowOrOut } from '../../../db/stock';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { QueueBadge } from '../components/QueueBadge';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

type Stats = {
  orders: number;
  products: number;
  alerts: number;
};

export function HomeScreen({ navigation }: Props) {
  const t = useT();
  const [stats, setStats] = useState<Stats>({ orders: 0, products: 0, alerts: 0 });

  const load = useCallback(async () => {
    const [p, o, a] = await Promise.all([listProducts(1000), listOpenOrders(), listLowOrOut()]);
    setStats({ products: p.length, orders: o.length, alerts: a.length });
  }, []);

  useEffect(() => {
    load();
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text variant="labelLarge" color={palette.onSurfaceVariant}>
            {t('guard').toUpperCase()}
          </Text>
          <Text variant="displayMedium" style={{ marginTop: spacing.xs }}>
            {t('appName')}
          </Text>
          <View style={{ marginTop: spacing.md }}>
            <QueueBadge />
          </View>
        </View>

        <View style={styles.primary}>
          <Button
            label={t('startScanning')}
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
            {t('scanItem')}.
          </Text>
        </View>

        <View style={styles.tilesRow}>
          <Tile
            label={t('receiving')}
            value={stats.orders}
            sub={t('expectedToday')}
            glyph="🚚"
            onPress={() => navigation.navigate('Orders')}
          />
          <Tile
            label={t('stock')}
            value={stats.products}
            sub={t('stockSub')}
            glyph="📦"
            onPress={() => navigation.navigate('Stock')}
          />
        </View>

        <View style={styles.tilesRow}>
          <Tile
            label={t('issue')}
            sub={t('issueSub')}
            glyph="✋"
            onPress={() => navigation.navigate('Issue')}
          />
          <Tile
            label={t('alerts')}
            value={stats.alerts || undefined}
            sub={t('alertsSub')}
            glyph="🔔"
            tone={stats.alerts > 0 ? 'warn' : 'neutral'}
            onPress={() => navigation.navigate('Alerts')}
          />
        </View>

        <View style={styles.tilesRow}>
          <Tile
            label="Sync queue"
            sub="Review pending uploads"
            glyph="↻"
            onPress={() => navigation.navigate('Outbox')}
          />
          <View style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type TileProps = {
  label: string;
  value?: number;
  sub: string;
  glyph: string;
  tone?: 'neutral' | 'warn';
  onPress: () => void;
};

function Tile({ label, value, sub, glyph, tone = 'neutral', onPress }: TileProps) {
  return (
    <Card tone="filled" onPress={onPress} style={styles.tile}>
      <View style={styles.tileHeader}>
        <Text variant="labelLarge" color={palette.onSurfaceVariant}>
          {label.toUpperCase()}
        </Text>
        <Text variant="titleLarge">{glyph}</Text>
      </View>
      {value !== undefined ? (
        <Text
          variant="displayMedium"
          color={tone === 'warn' ? palette.error : palette.onSurface}
          style={{ marginTop: spacing.xs }}
        >
          {value}
        </Text>
      ) : (
        <View style={{ height: spacing.md }} />
      )}
      <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
        {sub}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  scroll: { paddingBottom: spacing.xxxl },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  primary: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
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
