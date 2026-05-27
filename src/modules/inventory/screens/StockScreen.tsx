import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import {
  AppBar,
  Card,
  radius,
  Skeleton,
  spacing,
  Text,
} from '../../../design';
import { listStock, statusFor, StockRow, syncStockFromRemote } from '../../../db/stock';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { api } from '../../../sync/api';
import { flushOnce } from '../../../sync/syncService';
import { FilterDropdown, FilterOption } from '../components/FilterDropdown';
import { useTheme } from '../../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Stock'>;

/** Subtle background tint per stock health */
function cardBg(row: StockRow): string {
  const s = statusFor(row);
  if (s === 'out') return 'rgba(229, 57, 53, 0.07)';     // very faint red
  if (s === 'low') return 'rgba(249, 168, 37, 0.07)';     // very faint amber
  if (row.on_hand >= row.threshold * 2) return 'rgba(67, 160, 71, 0.06)'; // faint green
  return 'rgba(129, 199, 132, 0.06)';                      // faint light green
}

/** Count text color per stock health */
function countColor(row: StockRow): string {
  const s = statusFor(row);
  if (s === 'out') return '#E53935';
  if (s === 'low') return '#F9A825';
  if (row.on_hand >= row.threshold * 2) return '#43A047';
  return '#66BB6A';
}

const STATUS_OPTIONS: FilterOption[] = [
  { key: 'All', label: 'All Status' },
  { key: 'In Stock', label: 'In Stock' },
  { key: 'Low', label: 'Low' },
  { key: 'Out', label: 'Out of Stock' },
];

export function StockScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [initialLoading, setInitialLoading] = useState(true);

  const categoryOptions = useMemo<FilterOption[]>(() => {
    const cats = new Set(rows.map((r) => r.category).filter(Boolean) as string[]);
    return [{ key: 'All', label: 'All Categories' }, ...Array.from(cats).sort().map((c) => ({ key: c, label: c }))];
  }, [rows]);

  const load = useCallback(async () => {
    await flushOnce().catch(() => {});
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
      // Offline fallback
    }
    setRows(await listStock());
    setInitialLoading(false);
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
      if (statusFilter !== 'All') {
        const s = statusFor(r);
        if (statusFilter === 'In Stock' && s !== 'ok') return false;
        if (statusFilter === 'Low' && s !== 'low') return false;
        if (statusFilter === 'Out' && s !== 'out') return false;
      }
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.barcode.includes(q) || (r.category ?? '').toLowerCase().includes(q);
    });
  }, [rows, query, category, statusFilter]);

  return (
    <View style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar title={t('stock')} subtitle={t('stockSub')} onBack={() => navigation.goBack()} />

      <View style={styles.search}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('search')}
          placeholderTextColor={palette.onSurfaceVariant}
          style={[
            styles.searchInput,
            {
              backgroundColor: palette.surfaceContainerLowest,
              borderColor: palette.outlineVariant,
              color: palette.onSurface,
            },
          ]}
        />
      </View>

      {/* Dropdown filter row */}
      <View style={styles.filterRow}>
        <FilterDropdown
          label={t('filterCategory')}
          options={categoryOptions}
          selected={category}
          onSelect={setCategory}
        />
        <FilterDropdown
          label={t('filterStatus')}
          options={STATUS_OPTIONS}
          selected={statusFilter}
          onSelect={setStatusFilter}
        />
      </View>

      {initialLoading && rows.length === 0 ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ marginBottom: spacing.sm }}>
              <Card tone="filled" padding="lg">
                <View style={styles.row}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Skeleton width="60%" height={18} />
                    <Skeleton width="40%" height={14} />
                  </View>
                  <Skeleton width={40} height={24} />
                </View>
              </Card>
            </View>
          ))}
        </View>
      ) : (
      <FlatList
        data={filtered}
        keyExtractor={(r) => r.barcode}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => (
          <Card tone="filled" padding="lg" style={{ backgroundColor: cardBg(item) }}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium">{item.name}</Text>
                <Text
                  variant="bodyMedium"
                  color={palette.onSurfaceVariant}
                  style={{ marginTop: 2 }}
                >
                  {item.category ?? '—'}
                </Text>
              </View>
              <View style={styles.countCol}>
                <Text variant="titleLarge" color={countColor(item)} style={{ fontWeight: '700' }}>
                  {item.on_hand}
                </Text>
                {item.unit ? (
                  <Text variant="labelMedium" color={palette.onSurfaceVariant} style={{ textAlign: 'right' }}>
                    {item.unit}
                  </Text>
                ) : null}
              </View>
            </View>
          </Card>
        )}
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
              Try a different filter or clear the search.
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
  search: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  searchInput: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    fontSize: 17,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  list: { padding: spacing.xl, paddingTop: spacing.xs, paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  countCol: { minWidth: 44, alignItems: 'flex-end' },
  empty: { padding: spacing.xxl },
});

