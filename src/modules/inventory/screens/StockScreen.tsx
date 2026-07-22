import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HandCoins, PackagePlus, Pencil, Search, type LucideIcon } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, LayoutAnimation, Platform, Pressable, RefreshControl, StyleSheet, TextInput, View, KeyboardAvoidingView } from 'react-native';
import {
  AppBar,
  Card,
  radius,
  Skeleton,
  spacing,
  Text,
} from '../../../design';
import { listStock, statusFor, StockRow, replaceStockFromRemote } from '../../../db/stock';
import { pruneLotsToBarcodes, replaceLotsLocal } from '../../../db/lots';
import { useT } from '../../../i18n';
import { StringKey } from '../../../i18n/strings';
import { RootStackParamList } from '../../../navigation/types';
import { api } from '../../../sync/api';
import { flushOnce } from '../../../sync/syncService';
import { FilterDropdown, FilterOption } from '../components/FilterDropdown';
import { useTheme } from '../../../theme';
import { onCacheStateChange, useCacheStatus } from '../../../sync/cacheStatus';
import { invalidateRefetchThrottle, refetchThrottled } from '../../../sync/refetch';
import { formatOnHandShort } from '../../../units';

type Props = NativeStackScreenProps<RootStackParamList, 'Stock'>;

/** Card background per stock health — design uses white for OK, amber tint for LOW, red tint for OUT */
function cardBg(row: StockRow): string {
  const s = statusFor(row);
  if (s === 'out') return '#FFEBEE';
  if (s === 'low') return '#FFF8E1';
  return '#FFFFFF';
}

/** Vertical color strip on the left edge of each stock card */
function stripColor(row: StockRow): string {
  const s = statusFor(row);
  if (s === 'out') return '#E53935';
  if (s === 'low') return '#F9A825';
  return '#43A047';
}

/** Count text color per stock health */
function countColor(row: StockRow): string {
  const s = statusFor(row);
  if (s === 'out') return '#E53935';
  if (s === 'low') return '#F9A825';
  if (row.on_hand >= row.threshold * 2) return '#43A047';
  return '#66BB6A';
}

/**
 * Split the on-hand display into a big number and a small unit label so the
 * count column reads as "86" / "kg" (design) instead of a single ragged
 * "86 kg" string. formatOnHandShort never puts a space inside the number
 * (thousands use commas), so the last space cleanly separates value/unit.
 */
function countParts(row: StockRow): { value: string; unit: string } {
  const full = formatOnHandShort(row.on_hand, row.pack_size, row.unit);
  const i = full.lastIndexOf(' ');
  if (i === -1) return { value: full, unit: '' };
  return { value: full.slice(0, i), unit: full.slice(i + 1) };
}

// Stable keys drive the filter logic; labels are resolved per-render via
// t() so they follow the active language.
const STATUS_OPTIONS: { key: string; labelKey: StringKey }[] = [
  { key: 'All', labelKey: 'statusAll' },
  { key: 'In Stock', labelKey: 'statusInStock' },
  { key: 'Low', labelKey: 'statusLow' },
  { key: 'Out', labelKey: 'statusOut' },
];

export function StockScreen({ route, navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [refreshing, setRefreshing] = useState(false);
  // False until the first local read resolves — stops the "Nothing
  // matches" empty state flashing before readLocal() returns (warmCache
  // flips hasEverBeenWarm at login, before this screen mounts).
  const [loadedLocal, setLoadedLocal] = useState(false);
  // Smart Stock Card: which card is expanded to show action buttons.
  // Supports deep-linking via route params (e.g. from AlertsScreen).
  const [expandedBarcode, setExpandedBarcode] = useState<string | null>(
    route.params?.expandBarcode ?? null,
  );
  const stockStatus = useCacheStatus('stock');
  // Skeleton until the first local read lands, OR while we have NEVER
  // successfully warmed the stock cache this session AND we're not
  // sitting on a known failure state (error / offline) — in those
  // terminal states we'd rather show whatever's in local SQLite than a
  // forever-spinner.
  const showInitialSkeleton =
    !loadedLocal ||
    (!stockStatus.hasEverBeenWarm &&
      stockStatus.state !== 'error' &&
      stockStatus.state !== 'offline');

  const categoryOptions = useMemo<FilterOption[]>(() => {
    const cats = new Set(rows.map((r) => r.category).filter(Boolean) as string[]);
    return [{ key: 'All', label: t('allCategories') }, ...Array.from(cats).sort().map((c) => ({ key: c, label: c }))];
  }, [rows, t]);
  const statusOptions = useMemo<FilterOption[]>(
    () => STATUS_OPTIONS.map((o) => ({ key: o.key, label: t(o.labelKey) })),
    [t],
  );

  // Pull the latest stock from the server and replace the local cache.
  // Throws on failure so refetchThrottled() can flip the cache state to
  // error / offline appropriately. flushOnce() runs first so any
  // just-queued local writes hit the server before this read.
  const fetchRemote = useCallback(async () => {
    await flushOnce().catch(() => {});
    const remote = await api.fetch.stock();
    await replaceStockFromRemote(
      remote.map((r) => ({
        barcode: r.barcode,
        name: r.name,
        category: r.category,
        unit: r.unit,
        pack_size: r.pack_size != null ? Number(r.pack_size) : null,
        dispense_mode: r.dispense_mode ?? 'pack',
        on_hand: Number(r.on_hand),
        threshold: Number(r.threshold),
      })),
    );
    for (const r of remote) {
      await replaceLotsLocal(
        r.barcode,
        (r.lots ?? []).map((l) => ({
          expiry_date: l.expiry_date,
          qty: Number(l.qty),
        })),
      );
    }
    await pruneLotsToBarcodes(remote.map((r) => r.barcode));
  }, []);

  const readLocal = useCallback(async () => {
    setRows(await listStock());
    setLoadedLocal(true);
  }, []);

  // Always refetch on focus; the throttle in refetchThrottled stops a
  // back-tap burst from firing N parallel requests.
  const refresh = useCallback(async () => {
    await refetchThrottled('stock', fetchRemote);
    await readLocal();
  }, [fetchRemote, readLocal]);

  useEffect(() => {
    void readLocal();
    void refresh();
    const unsub = navigation.addListener('focus', () => { void refresh(); });
    // Subscribe to cache state changes too — warmCache or
    // post-write invalidation in flushOnce can update the cache from
    // outside this screen; re-read SQLite so the list reflects it.
    const unsubCache = onCacheStateChange('stock', (s) => {
      if (s.state === 'warm') void readLocal();
    });
    return () => { unsub(); unsubCache(); };
  }, [navigation, refresh, readLocal]);

  const onRefresh = useCallback(async () => {
    // Pull-to-refresh is a user-initiated request — never skip it.
    invalidateRefetchThrottle('stock');
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.search}>
        <View
          style={[
            styles.searchBox,
            {
              backgroundColor: palette.surfaceContainerLowest,
              borderColor: palette.outlineVariant,
            },
          ]}
        >
          <Search size={20} color={palette.onSurfaceVariant} strokeWidth={2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('search')}
            placeholderTextColor={palette.onSurfaceVariant}
            style={[styles.searchInput, { color: palette.onSurface }]}
          />
        </View>
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
          options={statusOptions}
          selected={statusFilter}
          onSelect={setStatusFilter}
        />
      </View>

      {showInitialSkeleton && rows.length === 0 ? (
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => {
          const isExpanded = expandedBarcode === item.barcode;
          const status = statusFor(item);
          const count = countParts(item);
          return (
          <Card
            tone="elevated"
            padding="lg"
            style={{ backgroundColor: cardBg(item) }}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setExpandedBarcode((prev) => (prev === item.barcode ? null : item.barcode));
            }}
          >
            <View style={styles.row}>
              {/* Color strip — visual status indicator */}
              <View style={[styles.strip, { backgroundColor: stripColor(item) }]} />
              <View style={styles.nameCol}>
                <Text variant="titleMedium" style={{ fontWeight: '700' }} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text
                  variant="bodyMedium"
                  color={palette.onSurfaceVariant}
                  style={{ marginTop: 2 }}
                  numberOfLines={1}
                >
                  {item.category ?? '—'}
                </Text>
              </View>
              <View style={styles.countCol}>
                <Text
                  color={countColor(item)}
                  style={styles.countValue}
                  numberOfLines={1}
                >
                  {count.value}
                </Text>
                {status === 'out' ? (
                  <Text color="#E53935" style={styles.countLabel}>OUT</Text>
                ) : status === 'low' ? (
                  <Text color="#c98b00" style={styles.countLabel}>LOW</Text>
                ) : count.unit ? (
                  <Text color={palette.onSurfaceVariant} style={styles.countUnit}>
                    {count.unit}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Smart Stock Card: action buttons (expanded only) */}
            {isExpanded && (
              <View style={styles.actionRow}>
                <ActionButton
                  icon={HandCoins}
                  label={t('used')}
                  color={palette.primary}
                  onPress={() => navigation.navigate('Dispense', { barcode: item.barcode })}
                  disabled={item.on_hand <= 0}
                />
                <ActionButton
                  icon={PackagePlus}
                  label={t('received')}
                  color={palette.tertiary ?? palette.primary}
                  onPress={() => navigation.navigate('Receiving', { barcode: item.barcode })}
                />
                <ActionButton
                  icon={Pencil}
                  label={t('editStock')}
                  color={palette.onSurfaceVariant}
                  onPress={() => navigation.navigate('EditStock', { barcode: item.barcode })}
                />
              </View>
            )}
          </Card>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="headlineSmall" style={{ textAlign: 'center' }}>
              {t('nothingMatches')}
            </Text>
            <Text
              variant="bodyLarge"
              color={palette.onSurfaceVariant}
              style={{ textAlign: 'center', marginTop: spacing.sm }}
            >
              {t('tryDifferentFilter')}
            </Text>
          </View>
        }
      />
      )}
      </KeyboardAvoidingView>
    </View>
  );
}

// ── ActionButton (local to StockScreen) ──────────────────────────────

type ActionButtonProps = {
  icon: LucideIcon;
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
};

function ActionButton({ icon: Icon, label, color, onPress, disabled }: ActionButtonProps) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionBtn,
        {
          backgroundColor: pressed
            ? palette.surfaceContainerHighest ?? 'rgba(0,0,0,0.08)'
            : palette.surfaceContainerHigh ?? 'rgba(0,0,0,0.04)',
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <Icon size={20} color={color} strokeWidth={2.2} />
      <Text variant="labelMedium" color={color}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  search: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    paddingVertical: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  list: { padding: spacing.xl, paddingTop: spacing.xs, paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  strip: {
    width: 10,
    height: 44,
    borderRadius: 6,
  },
  nameCol: { flex: 1 },
  countCol: { minWidth: 56, alignItems: 'flex-end' },
  countValue: { fontSize: 24, lineHeight: 28, fontWeight: '800', textAlign: 'right' },
  countLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'right',
    marginTop: 2,
  },
  countUnit: { fontSize: 13, lineHeight: 16, textAlign: 'right', marginTop: 2 },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  empty: { padding: spacing.xxl },
});

