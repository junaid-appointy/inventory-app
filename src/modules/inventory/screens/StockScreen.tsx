import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  CalendarDays,
  Clock,
  HandCoins,
  MapPin,
  PackagePlus,
  Pencil,
  Search,
  type LucideIcon,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
  KeyboardAvoidingView,
} from 'react-native';
import {
  AppBar,
  Card,
  radius,
  Skeleton,
  spacing,
  Text,
} from '../../../design';
import { listStock, statusFor, StockRow, StockStatus } from '../../../db/stock';
import { pullStockIntoCache } from '../../../sync/stockPull';
import { useT } from '../../../i18n';
import { StringKey } from '../../../i18n/strings';
import { RootStackParamList } from '../../../navigation/types';
import { flushOnce } from '../../../sync/syncService';
import { FilterDropdown, FilterOption } from '../components/FilterDropdown';
import { useTheme } from '../../../theme';
import type { Palette } from '../../../design/tokens';
import { onCacheStateChange, useCacheStatus } from '../../../sync/cacheStatus';
import { invalidateRefetchThrottle, refetchThrottled } from '../../../sync/refetch';
import { formatOnHandShort } from '../../../units';
import {
  compareExpiryAsc,
  expiryUrgency,
  formatExpiry,
  relativeExpiry,
  urgencyColors,
} from '../../../utils/expiry';

type Props = NativeStackScreenProps<RootStackParamList, 'Stock'>;

// ─── Status → colour ─────────────────────────────────────────────
// All of these read from the theme so the screen works in dark mode.
// They used to be hardcoded hex, which meant white cards on a dark
// background. `success` is an extended Material 3 role we added to the
// token set — green is load-bearing here, so it belongs in the tokens.

function statusColors(status: StockStatus, palette: Palette) {
  if (status === 'out') return { fg: palette.error, bg: palette.errorContainer, on: palette.onErrorContainer };
  if (status === 'low') return { fg: palette.warn, bg: palette.warnContainer, on: palette.onWarnContainer };
  return { fg: palette.success, bg: palette.successContainer, on: palette.onSuccessContainer };
}

const STATUS_LABEL: Record<StockStatus, StringKey> = {
  ok: 'statusInStock',
  low: 'statusLow',
  out: 'statusOut',
};

/**
 * How much of the last restock is left, 0..1.
 *
 * The denominator is `opening_qty` — the level recorded the last time
 * the item was received or counted — NOT pack size. Pack size is the
 * size of one pack, so an item holding three 500 g packs would report
 * more left than it started with and a bar past 100%.
 *
 * Returns null when the item has not been received or counted since the
 * column existed. The bar is then hidden rather than drawn against a
 * denominator we would have had to invent.
 */
function usageFill(row: StockRow): number | null {
  const opening = row.opening_qty ?? null;
  if (opening === null || opening <= 0) return null;
  return Math.max(0, Math.min(1, row.on_hand / opening));
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * "28 Jul 14:32" — the actual moment, not "2 hours ago".
 *
 * Left locale-neutral on purpose, matching how expiry dates are rendered
 * everywhere else in the app: the month abbreviation is readable in both
 * languages and a translated date format would make two screens showing
 * the same timestamp disagree.
 */
function formatWhen(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${hh}:${mm}`;
}

type SortKey = 'name' | 'lowest' | 'expiring' | 'updated';

const SORT_OPTIONS: { key: SortKey; labelKey: StringKey }[] = [
  { key: 'name', labelKey: 'sortNameAsc' },
  { key: 'lowest', labelKey: 'sortLowestFirst' },
  { key: 'expiring', labelKey: 'sortExpiringFirst' },
  { key: 'updated', labelKey: 'sortRecentlyUpdated' },
];

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
  const [sort, setSort] = useState<SortKey>('name');
  const [refreshing, setRefreshing] = useState(false);
  const [loadedLocal, setLoadedLocal] = useState(false);
  const [expandedBarcode, setExpandedBarcode] = useState<string | null>(
    route.params?.expandBarcode ?? null,
  );
  const stockStatus = useCacheStatus('stock');
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
  const sortOptions = useMemo<FilterOption[]>(
    () => SORT_OPTIONS.map((o) => ({ key: o.key, label: t(o.labelKey) })),
    [t],
  );

  const fetchRemote = useCallback(async () => {
    await flushOnce().catch(() => {});
    await pullStockIntoCache();
  }, []);

  const readLocal = useCallback(async () => {
    setRows(await listStock());
    setLoadedLocal(true);
  }, []);

  const refresh = useCallback(async () => {
    await refetchThrottled('stock', fetchRemote);
    await readLocal();
  }, [fetchRemote, readLocal]);

  useEffect(() => {
    void readLocal();
    void refresh();
    const unsub = navigation.addListener('focus', () => { void refresh(); });
    const unsubCache = onCacheStateChange('stock', (s) => {
      if (s.state === 'warm') void readLocal();
    });
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

  /** Counts across the WHOLE catalogue, never the filtered view — the
   *  tiles are a fixed picture of the site, not a description of the
   *  list below them. */
  const summary = useMemo(() => {
    let ok = 0, low = 0, out = 0;
    for (const r of rows) {
      const s = statusFor(r);
      if (s === 'ok') ok++;
      else if (s === 'low') low++;
      else out++;
    }
    return { total: rows.length, ok, low, out };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (category !== 'All' && r.category !== category) return false;
      if (statusFilter !== 'All') {
        const s = statusFor(r);
        if (statusFilter === 'In Stock' && s !== 'ok') return false;
        if (statusFilter === 'Low' && s !== 'low') return false;
        if (statusFilter === 'Out' && s !== 'out') return false;
      }
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.barcode.includes(q) ||
        (r.category ?? '').toLowerCase().includes(q) ||
        (r.location ?? '').toLowerCase().includes(q)
      );
    });

    const sorted = [...list];
    if (sort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'lowest') {
      // Proportion of the reorder point, so a 2-of-5 item outranks a
      // 200-of-1000 one. Items with no threshold sort last: without a
      // reorder point there is no such thing as "running low".
      const ratio = (r: StockRow) => (r.threshold > 0 ? r.on_hand / r.threshold : Number.POSITIVE_INFINITY);
      sorted.sort((a, b) => ratio(a) - ratio(b));
    } else if (sort === 'expiring') {
      sorted.sort((a, b) => compareExpiryAsc(a.nearest_expiry ?? null, b.nearest_expiry ?? null));
    } else {
      sorted.sort((a, b) => b.updated_at - a.updated_at);
    }
    return sorted;
  }, [rows, query, category, statusFilter, sort]);

  /** Tapping a summary tile filters to it; tapping the active one clears. */
  const toggleStatus = (key: string) =>
    setStatusFilter((prev) => (prev === key ? 'All' : key));

  // Row callbacks take the barcode rather than closing over the row, so
  // they stay referentially stable forever. Without this every render
  // handed each card four brand-new functions, React.memo could never
  // bail out, and typing one character in the search box re-rendered
  // every mounted row — which is exactly what VirtualizedList was
  // complaining about (12s to update a 284-item list).
  const handleToggle = useCallback((barcode: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedBarcode((prev) => (prev === barcode ? null : barcode));
  }, []);
  const handleDispense = useCallback(
    (barcode: string) => navigation.navigate('Dispense', { barcode }),
    [navigation],
  );
  const handleReceive = useCallback(
    (barcode: string) => navigation.navigate('Receiving', { barcode }),
    [navigation],
  );
  const handleEdit = useCallback(
    (barcode: string) => navigation.navigate('EditStock', { barcode }),
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: StockRow }) => (
      <StockCard
        row={item}
        expanded={expandedBarcode === item.barcode}
        onToggle={handleToggle}
        onDispense={handleDispense}
        onReceive={handleReceive}
        onEdit={handleEdit}
      />
    ),
    [expandedBarcode, handleToggle, handleDispense, handleReceive, handleEdit],
  );

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

        {/* Summary tiles double as the status filter. One tap to see
            everything that needs buying is the most common reason to
            open this screen at all. */}
        <View style={styles.summaryRow}>
          <SummaryTile
            value={summary.total}
            label={t('totalItems')}
            active={statusFilter === 'All'}
            onPress={() => setStatusFilter('All')}
          />
          <SummaryTile
            value={summary.ok}
            label={t('statusInStock')}
            tone={palette.success}
            active={statusFilter === 'In Stock'}
            onPress={() => toggleStatus('In Stock')}
          />
          <SummaryTile
            value={summary.low}
            label={t('statusLow')}
            tone={palette.warn}
            active={statusFilter === 'Low'}
            onPress={() => toggleStatus('Low')}
          />
          <SummaryTile
            value={summary.out}
            label={t('statusOut')}
            tone={palette.error}
            active={statusFilter === 'Out'}
            onPress={() => toggleStatus('Out')}
          />
        </View>

        <View style={styles.filterRow}>
          <FilterDropdown
            label={t('filterCategory')}
            options={categoryOptions}
            selected={category}
            onSelect={setCategory}
          />
          <FilterDropdown
            label={t('sortBy')}
            options={sortOptions}
            selected={sort}
            onSelect={(k) => setSort(k as SortKey)}
          />
        </View>

        {showInitialSkeleton && rows.length === 0 ? (
          <View style={styles.list}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ marginBottom: spacing.sm }}>
                <Card tone="elevated" padding="lg">
                  <View style={{ gap: 8 }}>
                    <Skeleton width="60%" height={18} />
                    <Skeleton width="40%" height={14} />
                    <Skeleton width="100%" height={8} rounded="pill" />
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
            ItemSeparatorComponent={Separator}
            renderItem={renderItem}
            // Windowing tuned for tall rows on cheap hardware. The
            // defaults (windowSize 21) kept ~60 of these mounted, which
            // is where the 12s update came from. Ten screens of buffer
            // buys nothing when a row is this tall.
            removeClippedSubviews
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            updateCellsBatchingPeriod={50}
            windowSize={7}
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

/** Hoisted so FlatList doesn't get a new component type every render —
 *  an inline separator remounts every row's divider on each pass. */
function Separator() {
  return <View style={{ height: spacing.sm }} />;
}

// ── Summary tile ─────────────────────────────────────────────────────

function SummaryTile({
  value,
  label,
  tone,
  active,
  onPress,
}: {
  value: number;
  label: string;
  tone?: string;
  active: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const accent = tone ?? palette.primary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.summaryTile,
        {
          backgroundColor: active ? `${accent}1A` : palette.surfaceContainerLowest,
          borderColor: active ? accent : palette.outlineVariant,
          borderWidth: active ? 2 : 1,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.summaryValue, { color: accent }]}>{value}</Text>
      <Text variant="labelMedium" color={palette.onSurfaceVariant} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── Stock card ───────────────────────────────────────────────────────

type StockCardProps = {
  row: StockRow;
  expanded: boolean;
  onToggle: (barcode: string) => void;
  onDispense: (barcode: string) => void;
  onReceive: (barcode: string) => void;
  onEdit: (barcode: string) => void;
};

/**
 * Memoised: with 284 items this is the difference between re-rendering
 * every mounted row on each keystroke and re-rendering none of them.
 * The default shallow compare is enough — `row` objects keep their
 * identity across filter/sort passes (those only build a new array), and
 * the four callbacks are stable by construction.
 */
const StockCard = React.memo(function StockCard({
  row,
  expanded,
  onToggle,
  onDispense,
  onReceive,
  onEdit,
}: StockCardProps) {
  const t = useT();
  const { palette } = useTheme();
  const status = statusFor(row);
  const colors = statusColors(status, palette);
  const fill = usageFill(row);
  const expiry = row.nearest_expiry ?? null;
  const urgency = expiryUrgency(expiry);
  const expiryTone = urgencyColors(urgency, palette);

  // Bind the barcode here rather than in the parent's renderItem, so the
  // props this component receives stay stable and the memo can bail out.
  const barcode = row.barcode;
  const handlePress = useCallback(() => onToggle(barcode), [onToggle, barcode]);
  const handleDispense = useCallback(() => onDispense(barcode), [onDispense, barcode]);
  const handleReceive = useCallback(() => onReceive(barcode), [onReceive, barcode]);
  const handleEdit = useCallback(() => onEdit(barcode), [onEdit, barcode]);

  // Derived display values. Cheap individually, but they run for every
  // mounted row, so keep them out of the JSX where they'd be recomputed
  // on each of the conditional branches below.
  const countLabel = formatOnHandShort(row.on_hand, row.pack_size, row.unit);
  const openingLabel =
    fill !== null
      ? formatOnHandShort(row.opening_qty ?? 0, row.pack_size, row.unit)
      : null;
  const expiryRelative = expiry ? relativeExpiry(expiry, t) : null;

  return (
    <Card
      tone="elevated"
      padding="lg"
      style={{ backgroundColor: palette.surfaceContainerLowest }}
      onPress={handlePress}
    >
      {/* Row 1 — identity and the number, the two things scanned first */}
      <View style={styles.headRow}>
        <View style={[styles.dot, { backgroundColor: colors.fg }]} />
        <View style={{ flex: 1 }}>
          <Text variant="titleMedium" style={{ fontWeight: '700' }} numberOfLines={2}>
            {row.name}
          </Text>
        </View>
        <Text style={[styles.count, { color: colors.fg }]} numberOfLines={1}>
          {countLabel}
        </Text>
      </View>

      {/* Row 2 — what's left of what was stocked, plus the status pill.
          Hidden entirely until the item has been received or counted at
          least once; there is no honest denominator before that. */}
      <View style={styles.metaRow}>
        <Text
          variant="bodyMedium"
          color={palette.onSurfaceVariant}
          numberOfLines={1}
          style={{ flex: 1 }}
        >
          {openingLabel ? t('leftOfStocked', { amount: openingLabel }) : ' '}
        </Text>
        <View style={[styles.pill, { backgroundColor: colors.bg }]}>
          <Text variant="labelMedium" color={colors.on} style={{ fontWeight: '700' }}>
            {t(STATUS_LABEL[status])}
          </Text>
        </View>
      </View>

      {/* Row 3 — how much of that restock is left. */}
      {fill !== null ? (
        <View style={styles.barRow}>
          <View style={[styles.barTrack, { backgroundColor: palette.surfaceContainerHigh }]}>
            <View
              style={[
                styles.barFill,
                { width: `${Math.round(fill * 100)}%`, backgroundColor: colors.fg },
              ]}
            />
          </View>
        </View>
      ) : null}

      {/* Row 4 — where it lives, when the number was last touched, and
          the nearest expiry. Each part disappears when it has nothing to
          say, so items with no shelf and no expiry stay two lines tall. */}
      <View style={styles.subRow}>
        {row.location ? (
          <View style={styles.subItem}>
            <MapPin size={13} color={palette.onSurfaceVariant} strokeWidth={2.2} />
            <Text variant="labelMedium" color={palette.onSurfaceVariant} numberOfLines={1}>
              {row.location}
            </Text>
          </View>
        ) : null}
        <View style={styles.subItem}>
          <Clock size={13} color={palette.onSurfaceVariant} strokeWidth={2.2} />
          <Text variant="labelMedium" color={palette.onSurfaceVariant}>
            {formatWhen(row.updated_at)}
          </Text>
        </View>
        {expiry ? (
          <View style={styles.subItem}>
            <CalendarDays size={13} color={expiryTone.fg} strokeWidth={2.2} />
            <Text variant="labelMedium" color={expiryTone.fg} numberOfLines={1}>
              {formatExpiry(expiry)}{expiryRelative ? ` · ${expiryRelative}` : ''}
            </Text>
          </View>
        ) : null}
      </View>

      {expanded && (
        <View style={[styles.actionRow, { borderTopColor: palette.outlineVariant }]}>
          <ActionButton
            icon={HandCoins}
            label={t('used')}
            color={palette.primary}
            onPress={handleDispense}
            disabled={row.on_hand <= 0}
          />
          <ActionButton
            icon={PackagePlus}
            label={t('received')}
            color={palette.tertiary ?? palette.primary}
            onPress={handleReceive}
          />
          <ActionButton
            icon={Pencil}
            label={t('editStock')}
            color={palette.onSurfaceVariant}
            onPress={handleEdit}
          />
        </View>
      )}
    </Card>
  );
});

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
            ? palette.surfaceContainerHighest
            : palette.surfaceContainerHigh,
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
  searchInput: { flex: 1, fontSize: 17, paddingVertical: 0 },

  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  summaryTile: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    gap: 2,
    minHeight: 64,
    justifyContent: 'center',
  },
  summaryValue: { fontSize: 22, lineHeight: 26, fontWeight: '800' },

  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.xs, paddingBottom: spacing.xxxl },

  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  count: { fontSize: 22, lineHeight: 26, fontWeight: '800', textAlign: 'right' },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
  },
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },

  subRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: 6,
  },
  subItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 10 },
  barTrack: { flex: 1, height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill },

  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
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
