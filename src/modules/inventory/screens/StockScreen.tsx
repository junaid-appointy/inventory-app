import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AlertTriangle, Clock, HandCoins, Layers, MapPin, PackagePlus, Pencil, Search, X, type LucideIcon } from 'lucide-react-native';
import { DateTile } from '../../../components/DateTile';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useCan } from '../../../auth';
import {
  AppBar,
  Appear,
  BottomSheet,
  PressScale,
  Button,
  Chip,
  IconBadge,
  RowDivider,
  Skeleton,
  spacing,
  StatusChip,
  Text,
} from '../../../design';
import { listStock, statusFor, type StockRow } from '../../../db/stock';
import { useT } from '../../../i18n';
import type { RootStackParamList } from '../../../navigation/types';
import { onCacheStateChange, useCacheStatus } from '../../../sync/cacheStatus';
import { invalidateRefetchThrottle, refetchThrottled } from '../../../sync/refetch';
import { pullStockIntoCache } from '../../../sync/stockPull';
import { flushOnce } from '../../../sync/syncService';
import { useTheme } from '../../../theme';
import { formatOnHandShort, productShape, smallPerPack } from '../../../units';
import { compareExpiryAsc, expiryUrgency, formatExpiry, relativeExpiry } from '../../../utils/expiry';
import { categoryIcon } from '../categoryIcon';
import { PackShelf, shelfText } from '../components/Shelf';

type Props = NativeStackScreenProps<RootStackParamList, 'Stock'>;

/** One choice at a time: a status view, or one category. */
type Filter = 'all' | 'attention' | 'expiring' | `cat:${string}`;

const URGENCY = { out: 0, low: 1, ok: 2 } as const;

/**
 * How much of the last restock is left, 0..1. The denominator is
 * `opening_qty` (level at the last receipt or count), not pack size; null
 * until the item has been received or counted, and the bar is then hidden
 * rather than drawn against an invented number.
 */
function usageFill(row: StockRow): number | null {
  const opening = row.opening_qty ?? null;
  if (opening === null || opening <= 0) return null;
  return Math.max(0, Math.min(1, row.on_hand / opening));
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "28 Jul 14:32". Locale-neutral on purpose, like expiry dates elsewhere. */
function formatWhen(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * All items: search, one row of filter chips, plain rows. A row says only
 * what needs saying (low, out, expiring soon); tapping it opens a sheet
 * with the details and the actions this person's role allows.
 */
export function StockScreen({ route, navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const can = useCan();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loadedLocal, setLoadedLocal] = useState(false);
  const [openBarcode, setOpenBarcode] = useState<string | null>(route.params?.expandBarcode ?? null);
  const stockStatus = useCacheStatus('stock');
  const showSkeleton =
    !loadedLocal || (!stockStatus.hasEverBeenWarm && stockStatus.state !== 'error' && stockStatus.state !== 'offline');

  const readLocal = useCallback(async () => {
    setRows(await listStock());
    setLoadedLocal(true);
  }, []);

  const refresh = useCallback(async () => {
    await refetchThrottled('stock', async () => {
      await flushOnce().catch(() => {});
      await pullStockIntoCache();
    });
    await readLocal();
  }, [readLocal]);

  useEffect(() => {
    void readLocal();
    void refresh();
    const unsub = navigation.addListener('focus', () => { void refresh(); });
    const unsubCache = onCacheStateChange('stock', (s) => { if (s.state === 'warm') void readLocal(); });
    return () => { unsub(); unsubCache(); };
  }, [navigation, refresh, readLocal]);

  const onRefresh = useCallback(async () => {
    invalidateRefetchThrottle('stock');
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  // Chip counts describe the whole catalogue, not the filtered view.
  const counts = useMemo(() => {
    let attention = 0, expiring = 0;
    const cats = new Set<string>();
    for (const r of rows) {
      if (statusFor(r) !== 'ok') attention++;
      const u = expiryUrgency(r.nearest_expiry);
      if (u === 'soon' || u === 'expired') expiring++;
      if (r.category) cats.add(r.category);
    }
    return { attention, expiring, categories: [...cats].sort() };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (filter === 'attention' && statusFor(r) === 'ok') return false;
      if (filter === 'expiring') {
        const u = expiryUrgency(r.nearest_expiry);
        if (u !== 'soon' && u !== 'expired') return false;
      }
      if (filter.startsWith('cat:') && r.category !== filter.slice(4)) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.barcode.includes(q) ||
        (r.category ?? '').toLowerCase().includes(q) ||
        (r.location ?? '').toLowerCase().includes(q)
      );
    });
    // The sort follows the question being asked, so there is no sort menu.
    if (filter === 'attention') {
      list.sort((a, b) => URGENCY[statusFor(a)] - URGENCY[statusFor(b)] || a.name.localeCompare(b.name));
    } else if (filter === 'expiring') {
      list.sort((a, b) => compareExpiryAsc(a.nearest_expiry ?? null, b.nearest_expiry ?? null));
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [rows, query, filter]);

  const open = useCallback((barcode: string) => setOpenBarcode(barcode), []);
  // The first screenful eases in when the list opens.
  const renderItem = useCallback(
    ({ item, index }: { item: StockRow; index: number }) =>
      index < 8 ? (
        <Appear delay={index * 30}>
          <ItemRow row={item} onOpen={open} />
        </Appear>
      ) : (
        <ItemRow row={item} onOpen={open} />
      ),
    [open],
  );
  const selected = openBarcode ? rows.find((r) => r.barcode === openBarcode) ?? null : null;

  const goFromSheet = (to: 'Dispense' | 'Receiving' | 'EditStock') => {
    if (!selected) return;
    const barcode = selected.barcode;
    setOpenBarcode(null);
    navigation.navigate(to, { barcode });
  };

  // Every chip carries a picture, so the filters read without the words.
  const chips: Array<{ key: Filter; label: string; Icon: LucideIcon }> = [
    { key: 'all', label: `${t('filterAll')} ${rows.length}`, Icon: Layers },
    { key: 'attention', label: `${t('needsAttention')} ${counts.attention}`, Icon: AlertTriangle },
    ...(counts.expiring > 0 ? [{ key: 'expiring' as Filter, label: `${t('filterExpiring')} ${counts.expiring}`, Icon: Clock }] : []),
    ...counts.categories.map((c) => ({ key: `cat:${c}` as Filter, label: c, Icon: categoryIcon(c) })),
  ];

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <AppBar title={t('allItemsTitle')} onBack={() => navigation.goBack()} />

      <View style={[styles.search, { backgroundColor: palette.surfaceContainerLow, borderColor: palette.outlineVariant }]}>
        <Search size={20} color={palette.onSurfaceVariant} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('searchItem')}
          placeholderTextColor={palette.onSurfaceVariant}
          style={[styles.searchInput, { color: palette.onSurface }]}
          returnKeyType="search"
          autoFocus={!!route.params?.focusSearch}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={12} accessibilityLabel="Clear">
            <X size={20} color={palette.onSurfaceVariant} />
          </Pressable>
        ) : null}
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {chips.map((c) => (
            <Chip key={c.key} label={c.label} Icon={c.Icon} selected={filter === c.key} onPress={() => setFilter(c.key)} />
          ))}
        </ScrollView>
      </View>

      {showSkeleton && rows.length === 0 ? (
        <View style={{ paddingTop: spacing.sm }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={48} height={48} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton width="60%" height={16} />
                <Skeleton width="35%" height={12} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.barcode}
          renderItem={renderItem}
          ItemSeparatorComponent={Divider}
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
          // Rows are short now; keep windowing modest for cheap phones.
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="titleLarge" style={{ textAlign: 'center' }}>
                {t('nothingMatches')}
              </Text>
              <Text variant="bodyLarge" color={palette.onSurfaceVariant} style={{ textAlign: 'center', marginTop: spacing.sm }}>
                {t('tryDifferentFilter')}
              </Text>
            </View>
          }
        />
      )}

      <BottomSheet visible={!!selected} onClose={() => setOpenBarcode(null)}>
        {selected ? (
          <ItemSheet
            row={selected}
            canIssue={can('inventory.issue')}
            canReceive={can('inventory.receive')}
            canAdjust={can('inventory.adjust')}
            onTakeOut={() => goFromSheet('Dispense')}
            onReceive={() => goFromSheet('Receiving')}
            onCorrect={() => goFromSheet('EditStock')}
          />
        ) : null}
      </BottomSheet>
    </View>
  );
}

/** Hoisted so FlatList gets a stable separator type. */
function Divider() {
  return <RowDivider />;
}

/** One item, one line of detail. Memoised for long lists on cheap phones. */
const ItemRow = React.memo(function ItemRow({ row, onOpen }: { row: StockRow; onOpen: (barcode: string) => void }) {
  const t = useT();
  const { palette } = useTheme();
  const status = statusFor(row);
  const urgency = expiryUrgency(row.nearest_expiry);
  const expiryNote = urgency === 'soon' || urgency === 'expired' ? relativeExpiry(row.nearest_expiry, t) : null;
  const detail = [formatOnHandShort(row.on_hand, row.pack_size, row.unit), row.location].filter(Boolean).join(' · ');
  const handlePress = useCallback(() => onOpen(row.barcode), [onOpen, row.barcode]);
  return (
    <PressScale to={0.98} onPress={handlePress} android_ripple={{ color: palette.surfaceContainerHigh }} style={styles.row}>
      <IconBadge Icon={categoryIcon(row.category)} size={48} />
      <View style={{ flex: 1 }}>
        <Text variant="titleMedium" numberOfLines={1} style={{ fontWeight: '600' }}>
          {row.name}
        </Text>
        <Text variant="bodyMedium" color={palette.onSurfaceVariant} numberOfLines={1} style={{ marginTop: 2 }}>
          {detail}
        </Text>
        {expiryNote ? (
          <Text variant="labelMedium" color={urgency === 'expired' ? palette.error : palette.amber} style={{ marginTop: 2 }}>
            {expiryNote}
          </Text>
        ) : null}
      </View>
      {status !== 'ok' ? (
        <StatusChip label={status === 'out' ? t('outOfStock') : t('lowChip')} tone={status === 'out' ? 'danger' : 'warn'} />
      ) : null}
    </PressScale>
  );
});

/** The item sheet (design 02): what it is, how much is left, what to do. */
function ItemSheet({
  row,
  canIssue,
  canReceive,
  canAdjust,
  onTakeOut,
  onReceive,
  onCorrect,
}: {
  row: StockRow;
  canIssue: boolean;
  canReceive: boolean;
  canAdjust: boolean;
  onTakeOut: () => void;
  onReceive: () => void;
  onCorrect: () => void;
}) {
  const t = useT();
  const { palette } = useTheme();
  const status = statusFor(row);
  const fill = usageFill(row);
  const urgency = expiryUrgency(row.nearest_expiry);
  const expiryColor = urgency === 'expired' ? palette.error : urgency === 'soon' ? palette.amber : palette.onSurface;
  const barColor = status === 'out' ? palette.error : status === 'low' ? palette.amber : palette.success;
  // Pack items get the shelf picture: closed packs and the open one.
  const packed = productShape(row.pack_size, row.unit) !== 'single' && row.on_hand > 0;
  const perPack = smallPerPack(row.pack_size, row.unit);

  return (
    <View>
      <View style={styles.sheetHead}>
        <IconBadge Icon={categoryIcon(row.category)} size={56} />
        <View style={{ flex: 1 }}>
          <Text variant="titleLarge" style={{ fontWeight: '700' }} numberOfLines={2}>
            {row.name}
          </Text>
          {row.category ? (
            <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
              {row.category}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.countRow}>
        <Text variant="displayMedium" style={{ fontWeight: '800' }}>
          {formatOnHandShort(row.on_hand, row.pack_size, row.unit)}
        </Text>
        {status !== 'ok' ? (
          <StatusChip label={status === 'out' ? t('outOfStock') : t('lowChip')} tone={status === 'out' ? 'danger' : 'warn'} />
        ) : (
          <StatusChip label={t('inStockChip')} tone="success" />
        )}
      </View>

      {packed ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <PackShelf Icon={categoryIcon(row.category)} perPack={perPack} totalSmall={Math.round(row.on_hand * perPack)} unit={row.unit} />
          <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ textAlign: 'center' }}>
            {shelfText(t, Math.round(row.on_hand * perPack), perPack, row.unit)}
          </Text>
        </View>
      ) : null}

      {fill !== null ? (
        <>
          <View style={[styles.track, { backgroundColor: palette.surfaceContainerHigh }]}>
            <View style={{ width: `${Math.round(fill * 100)}%`, height: '100%', borderRadius: 4, backgroundColor: barColor }} />
          </View>
          <Text variant="labelMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.xs }}>
            {t('ofLastRestock', {
              left: formatOnHandShort(row.on_hand, row.pack_size, row.unit),
              stocked: formatOnHandShort(row.opening_qty ?? 0, row.pack_size, row.unit),
            })}
          </Text>
        </>
      ) : null}

      <View style={[styles.facts, { borderColor: palette.outlineVariant }]}>
        {row.location ? <Fact Icon={MapPin} label={t('shelfLabel')} value={row.location} /> : null}
        {row.nearest_expiry ? (
          <Fact
            leading={<DateTile iso={row.nearest_expiry} size="sm" />}
            label={t('expiryLabel')}
            value={[formatExpiry(row.nearest_expiry), relativeExpiry(row.nearest_expiry, t)].filter(Boolean).join(' · ')}
            color={expiryColor}
          />
        ) : null}
        <Fact Icon={Clock} label={t('updatedLabel')} value={formatWhen(row.updated_at)} />
      </View>

      <View style={styles.actions}>
        {canIssue ? (
          <View style={{ flex: 1 }}>
            <Button
              label={t('takeOutAction')}
              onPress={onTakeOut}
              size="lg"
              fullWidth
              disabled={row.on_hand <= 0}
              Icon={HandCoins}
            />
          </View>
        ) : null}
        {canReceive ? (
          <View style={{ flex: 1 }}>
            <Button
              label={t('receiveShort')}
              onPress={onReceive}
              variant="outlined"
              size="lg"
              fullWidth
              Icon={PackagePlus}
            />
          </View>
        ) : null}
      </View>
      {canAdjust ? (
        <Button
          label={t('correctCount')}
          onPress={onCorrect}
          variant="text"
          size="md"
          fullWidth
          Icon={Pencil}
          style={{ marginTop: spacing.xs }}
        />
      ) : null}
    </View>
  );
}

function Fact({ label, value, color, Icon, leading }: { label: string; value: string; color?: string; Icon?: LucideIcon; leading?: React.ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={styles.fact}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        {leading ?? (Icon ? <Icon size={22} color={palette.onSurfaceVariant} /> : null)}
        <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
          {label}
        </Text>
      </View>
      <Text variant="bodyLarge" color={color ?? palette.onSurface} style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 52,
    marginHorizontal: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: 72,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  empty: { paddingTop: spacing.xxxl, paddingHorizontal: spacing.xl },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.sm },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  facts: { marginTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  fact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
