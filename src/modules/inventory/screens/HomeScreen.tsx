import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Bell, type LucideIcon, HandCoins, Package, RefreshCw, ScanLine, Settings as SettingsIcon, Truck } from 'lucide-react-native';
import { QueueBadge } from '../components/QueueBadge';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, IconButton, Skeleton, spacing, Text } from '../../../design';
import { useTheme } from '../../../theme';
import { getSession } from '../../../auth/session';
import { listOpenOrders } from '../../../db/orders';
import { listProducts } from '../../../db/products';
import { listLowOrOut } from '../../../db/stock';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

type Stats = {
  orders: number;
  products: number;
  alerts: number;
};

export function HomeScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const [stats, setStats] = useState<Stats | null>(null);

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
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: palette.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
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

        <View style={styles.primary}>
          <Button
            label={t('startScanning')}
            leadingIcon={<ScanLine size={28} color={palette.onPrimary} strokeWidth={2.4} />}
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
            value={stats?.orders}
            loading={!stats}
            sub={t('expectedToday')}
            Icon={Truck}
            onPress={() => navigation.navigate('Orders')}
          />
          <Tile
            label={t('stock')}
            value={stats?.products}
            loading={!stats}
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
          />
          <Tile
            label={t('alerts')}
            value={stats?.alerts || undefined}
            loading={!stats}
            sub={t('alertsSub')}
            Icon={Bell}
            tone={stats && stats.alerts > 0 ? 'warn' : 'neutral'}
            onPress={() => navigation.navigate('Alerts')}
          />
        </View>

        <View style={styles.tilesRow}>
          <Tile
            label={t('syncQueue')}
            sub={t('syncQueueSub')}
            Icon={RefreshCw}
            onPress={() => navigation.navigate('Outbox')}
            trailing={<QueueBadge />}
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
  loading?: boolean;
  sub: string;
  Icon: LucideIcon;
  tone?: 'neutral' | 'warn';
  trailing?: React.ReactNode;
  onPress: () => void;
};

function Tile({ label, value, loading, sub, Icon, tone = 'neutral', trailing, onPress }: TileProps) {
  const { palette } = useTheme();
  return (
    <Card tone="filled" onPress={onPress} style={styles.tile}>
      <View style={styles.tileHeader}>
        <Text variant="labelLarge" color={palette.onSurfaceVariant}>
          {label.toUpperCase()}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {trailing}
          <Icon
            size={22}
            color={tone === 'warn' ? palette.error : palette.primary}
            strokeWidth={2.2}
          />
        </View>
      </View>
      {loading ? (
        <View style={{ marginTop: spacing.xs, marginBottom: spacing.xs }}>
          <Skeleton width={64} height={36} />
        </View>
      ) : value !== undefined ? (
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
  safe: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
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
