import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import {
  AppBar,
  Card,
  Chip,
  palette,
  radius,
  spacing,
  StatusPill,
  Text,
} from '../../../design';
import { listStock, statusFor, StockRow, StockStatus, syncStockFromRemote } from '../../../db/stock';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { api } from '../../../sync/api';

type Props = NativeStackScreenProps<RootStackParamList, 'Stock'>;

const CATEGORIES = ['All', 'Stationery', 'Cleaning', 'Pantry', 'IT supplies'] as const;

const STATUS_TONE: Record<StockStatus, 'success' | 'warn' | 'danger'> = {
  ok: 'success',
  low: 'warn',
  out: 'danger',
};

const STATUS_LABEL: Record<StockStatus, string> = {
  ok: 'In stock',
  low: 'Low',
  out: 'Out',
};

export function StockScreen({ navigation }: Props) {
  const t = useT();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');

  const load = useCallback(async () => {
    // Mirror remote into local SQLite so the screen still works offline.
    try {
      const remote = await api.fetch.stock();
      await Promise.all(
        remote.map((r) =>
          syncStockFromRemote({
            barcode: r.barcode,
            name: r.name,
            category: r.category,
            unit: r.unit,
            on_hand: Number(r.on_hand),
            threshold: Number(r.threshold),
          }),
        ),
      );
    } catch {
      // Offline / 401 / server down — fall back to local cache.
    }
    setRows(await listStock());
  }, []);

  useEffect(() => {
    load();
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== 'All' && r.category !== category) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.barcode.includes(q);
    });
  }, [rows, query, category]);

  return (
    <View style={styles.safe}>
      <AppBar title={t('stock')} subtitle={t('stockSub')} onBack={() => navigation.goBack()} />

      <View style={styles.search}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('search')}
          placeholderTextColor={palette.onSurfaceVariant}
          style={styles.searchInput}
        />
      </View>

      <View style={styles.chips}>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={c} selected={c === category} onPress={() => setCategory(c)} />
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(r) => r.barcode}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => {
          const status = statusFor(item);
          return (
            <Card tone="filled" padding="lg">
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleMedium">{item.name}</Text>
                  <Text
                    variant="bodyMedium"
                    color={palette.onSurfaceVariant}
                    style={{ marginTop: 2 }}
                  >
                    {item.category ?? '—'} · {item.on_hand} {item.unit ?? ''} {t('onHand')}
                  </Text>
                </View>
                <StatusPill label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="headlineSmall" style={{ textAlign: 'center' }}>
              Nothing matches
            </Text>
            <Text
              variant="bodyLarge"
              color={palette.onSurfaceVariant}
              style={{ textAlign: 'center', marginTop: spacing.sm }}
            >
              Try a different category or clear the search.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  search: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  searchInput: {
    backgroundColor: palette.surfaceContainerLowest,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: palette.outlineVariant,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    color: palette.onSurface,
    fontSize: 17,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  list: { padding: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  empty: { padding: spacing.xxl },
});
