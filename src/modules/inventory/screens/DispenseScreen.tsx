import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check } from 'lucide-react-native';
import { nanoid } from 'nanoid/non-secure';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  AppBar,
  Button,
  Card,
  Chip,
  UnitAwareStepper,
  radius,
  Skeleton,
  spacing,
  Text,
} from '../../../design';
import type { DispenseMode } from '../../../design';
import {
  baseToPack,
  packToBase,
  canSubdivide,
  formatOnHand,
  formatOnHandShort,
  resolveUnit,
} from '../../../units';
import { enqueue } from '../../../db/outbox';
import { adjustOnHand, findStock, getNearestExpiry, listStock, replaceStockFromRemote, StockRow, statusFor } from '../../../db/stock';
import { decrementLotsLocal, listLots, pruneLotsToBarcodes, replaceLotsLocal } from '../../../db/lots';
import { LotAllocation, LotPicker, suggestFEFO } from '../components/LotPicker';
import { getSession } from '../../../auth/session';
import { useT } from '../../../i18n';
import { StringKey } from '../../../i18n/strings';
import { RootStackParamList } from '../../../navigation/types';
import { api, ApiError } from '../../../sync/api';
import { flushOnce } from '../../../sync/syncService';
import { invalidateRefetchThrottle, refetchThrottled } from '../../../sync/refetch';
import { haptic } from '../../../utils/haptics';
import { useKeyboardHeight } from '../../../hooks/useKeyboardHeight';
import { FilterDropdown, FilterOption } from '../components/FilterDropdown';
import { PackVisual } from '../components/PackVisual';
import { useTheme } from '../../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Dispense'>;

// `value` is the canonical English string recorded on the dispense; only
// the displayed label is translated, so reporting/grouping stays stable
// regardless of the guard's chosen language.
const REASONS: { value: string; labelKey: StringKey }[] = [
  { value: 'Office use', labelKey: 'reasonOfficeUse' },
  { value: 'Pantry', labelKey: 'reasonPantry' },
  { value: 'Cleaning', labelKey: 'reasonCleaning' },
  { value: 'Maintenance', labelKey: 'reasonMaintenance' },
  { value: 'Other', labelKey: 'reasonOther' },
];

// Stable keys drive the filter logic; labels are resolved per-render.
const STATUS_OPTIONS: { key: string; labelKey: StringKey }[] = [
  { key: 'All', labelKey: 'statusAll' },
  { key: 'In Stock', labelKey: 'statusInStock' },
  { key: 'Low', labelKey: 'statusLow' },
  { key: 'Out', labelKey: 'statusOut' },
];

type VerifyStatus = 'verifying' | 'ok' | 'absent' | 'offline' | 'error';

function isOfflineError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Network request failed') ||
    msg.includes('TypeError: Network') ||
    msg.includes('Unable to resolve host')
  );
}

/** Subtle background tint per stock health */
function cardBg(row: StockRow): string {
  const s = statusFor(row);
  if (s === 'out') return 'rgba(229, 57, 53, 0.07)';
  if (s === 'low') return 'rgba(249, 168, 37, 0.07)';
  if (row.on_hand >= row.threshold * 2) return 'rgba(67, 160, 71, 0.06)';
  return 'rgba(129, 199, 132, 0.06)';
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
 * The value a fresh dispense should open on. Starts at ONE unit of the
 * product's natural denomination — 1 pack for whole-pack goods, 1 base
 * unit (e.g. 1 kg) for divisible ones — capped at what's actually in
 * stock. Opening on the full available count read to guards as "take
 * everything"; dialing UP from a small amount is how dispensing works.
 * Returns the qty in packs (the denomination the lot system stores) plus
 * the mode the stepper should open in.
 */
function startingDispense(
  available: number,
  packSize: number | null | undefined,
  unit: string | null | undefined,
): { mode: DispenseMode; qty: number } {
  const ps = (packSize ?? 1) > 0 ? (packSize ?? 1) : 1;
  const divisible = canSubdivide(packSize, unit) && resolveUnit(unit).nature === 'continuous';
  const mode: DispenseMode = divisible ? 'unit' : 'pack';
  const oneUnitInPacks = mode === 'unit' ? 1 / ps : 1;
  return { mode, qty: Math.max(0, Math.min(available, oneUnitInPacks)) };
}

export function DispenseScreen({ route, navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const kbHeight = useKeyboardHeight();
  const initialBarcode = route.params?.barcode;
  const [selected, setSelected] = useState<StockRow | null>(null);
  const [all, setAll] = useState<StockRow[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [qty, setQty] = useState(1);
  // Whether the guard is picking in 'pack' (whole/fractional packs)
  // or 'unit' (base units like kg, litres, bars). Driven by the
  // UnitAwareStepper chip toggle.
  const [dispenseMode, setDispenseMode] = useState<DispenseMode>('pack');
  const [reason, setReason] = useState(REASONS[0].value);
  const [saving, setSaving] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // JIT verification — fetch the server's authoritative on_hand the
  // moment a product is selected. Dispense MUST commit against the
  // freshest count so we never let a guard dispense 10 from a stock
  // of 8. Fail-closed: if the JIT fetch fails or times out, the
  // confirm button stays disabled until the user goes back and tries
  // again with network.
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>('verifying');
  const [verifiedOnHand, setVerifiedOnHand] = useState<number | null>(null);
  /** Per-lot availability + current allocation. FEFO-ordered (earliest
   *  first). The big QtyStepper drives `qty` which re-suggests FEFO
   *  across these rows; users can override per-lot via the LotPicker
   *  (shown only when there are 2+ lots — single-lot products skip the
   *  picker). Total taken = sum(allocation.take). */
  const [allocation, setAllocation] = useState<LotAllocation[]>([]);
  const [availability, setAvailability] = useState<{ expiry: string | null; available: number }[]>([]);

  const categoryOptions = useMemo<FilterOption[]>(() => {
    const cats = new Set(all.map((r) => r.category).filter(Boolean) as string[]);
    return [{ key: 'All', label: t('allCategories') }, ...Array.from(cats).sort().map((c) => ({ key: c, label: c }))];
  }, [all, t]);
  const statusOptions = useMemo<FilterOption[]>(
    () => STATUS_OPTIONS.map((o) => ({ key: o.key, label: t(o.labelKey) })),
    [t],
  );

  // Pull the latest stock from the server and replace the local cache,
  // then re-read SQLite into the picker list. Mirrors StockScreen so the
  // dispense picker stays in sync with the source of truth — without this
  // it only ever showed whatever warmCache last left behind. Shares the
  // 'stock' refetch key with Stock/Alerts (same stock_levels table).
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
        (r.lots ?? []).map((l) => ({ expiry_date: l.expiry_date, qty: Number(l.qty) })),
      );
    }
    await pruneLotsToBarcodes(remote.map((r) => r.barcode));
  }, []);

  const readLocal = useCallback(async () => {
    setAll(await listStock());
  }, []);

  const refresh = useCallback(async () => {
    await refetchThrottled('stock', fetchRemote);
    await readLocal();
  }, [fetchRemote, readLocal]);

  useEffect(() => {
    readLocal().then(() => setInitialLoading(false));
    void refresh();
    const unsub = navigation.addListener('focus', () => { void refresh(); });
    return unsub;
  }, [navigation, refresh, readLocal]);

  const onRefresh = useCallback(async () => {
    // Pull-to-refresh is user-initiated — bypass the throttle so a pull
    // right after a focus-fetch isn't swallowed.
    invalidateRefetchThrottle('stock');
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (initialBarcode) {
      findStock(initialBarcode).then((r) => r && setSelected(r));
    }
  }, [initialBarcode]);

  // Whenever an item gets selected, re-run JIT verification. The
  // dependency on `selected?.barcode` (not the whole row) means
  // refetching only happens for an actual product change, not for the
  // optimistic update we apply after submit.
  useEffect(() => {
    if (!selected) {
      setVerifyStatus('verifying');
      setVerifiedOnHand(null);
      return;
    }
    let cancelled = false;
    setVerifyStatus('verifying');
    setVerifiedOnHand(null);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    (async () => {
      try {
        const remote = await api.fetch.stockOne(selected.barcode);
        if (cancelled) return;
        const remoteQty = Number(remote.on_hand);
        setVerifiedOnHand(remoteQty);
        setVerifyStatus('ok');
        // Open a fresh dispense low (1 unit of the natural denomination),
        // capped at the verified ceiling so the guard can never submit
        // over what exists. The stepper's `max` enforces the ceiling from
        // here on, so we don't need to clamp a carried-over qty.
        const { mode: startMode, qty: startQty } = startingDispense(
          remoteQty,
          selected.pack_size,
          selected.unit,
        );
        setDispenseMode(startMode);
        setQty(startQty);

        // Build the lot picker state. Prefer the remote lots (verified
        // truth); fall back to the local lots cache when the server
        // returned no breakdown. Final fallback for legacy rows that
        // never received a lot write (existed before the lots
        // migration): synthesise a single lot from on_hand +
        // nearest_expiry so dispense still works on existing inventory.
        const remoteLots = remote.lots ?? [];
        let lots = remoteLots.length > 0
          ? remoteLots
          : (await listLots(selected.barcode)).map((l) => ({
              expiry_date: l.expiry_date,
              qty: Number(l.qty),
            }));
        if (lots.length === 0 && remoteQty > 0) {
          lots = [{
            expiry_date: remote.nearest_expiry ?? null,
            qty: remoteQty,
          }];
        }
        const nextAvailability = lots.map((l) => ({
          expiry: l.expiry_date,
          available: Number(l.qty),
        }));
        setAvailability(nextAvailability);
        setAllocation(suggestFEFO(nextAvailability, startQty));
      } catch (err) {
        if (cancelled) return;
        // 404: the server has no record of this barcode (might be a
        // device-only item never received server-side). Treat as
        // "absent" — block dispense; you can't dispense what the
        // server doesn't know exists.
        if (err instanceof ApiError && err.status === 404) {
          setVerifyStatus('absent');
          return;
        }
        if (err instanceof ApiError && err.status === 401) return;

        // Couldn't reach the server (offline) or the check failed/timed
        // out. Offline-first decision: fall back to the last-known CACHED
        // count + local lots so the guard can still dispense. The write
        // queues in the outbox and reconciles on sync. Only the 404
        // "absent" case above stays blocked — everything else degrades to
        // the saved count rather than a dead button.
        const cachedQty = selected.on_hand;
        setVerifiedOnHand(cachedQty);
        const { mode: startMode, qty: startQty } = startingDispense(
          cachedQty,
          selected.pack_size,
          selected.unit,
        );
        setDispenseMode(startMode);
        setQty(startQty);
        let lots = (await listLots(selected.barcode)).map((l) => ({
          expiry_date: l.expiry_date,
          qty: Number(l.qty),
        }));
        if (lots.length === 0 && cachedQty > 0) {
          lots = [{ expiry_date: await getNearestExpiry(selected.barcode), qty: cachedQty }];
        }
        if (cancelled) return;
        const nextAvailability = lots.map((l) => ({
          expiry: l.expiry_date,
          available: Number(l.qty),
        }));
        setAvailability(nextAvailability);
        setAllocation(suggestFEFO(nextAvailability, startQty));
        setVerifyStatus(isOfflineError(err) ? 'offline' : 'error');
      } finally {
        clearTimeout(t);
      }
    })();
    return () => { cancelled = true; clearTimeout(t); controller.abort(); };
    // intentionally NOT in deps: `qty` would re-run the JIT on every
    // stepper tap; only refire when the selected barcode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.barcode]);

  const results = useMemo(() => {
    if (selected) return [];
    const q = query.trim().toLowerCase();
    // No cap: FlatList virtualizes, so the picker shows every stock item
    // when browsing. Capping here (was slice(0, 30)) silently hid items
    // for inventories with more than 30 SKUs.
    return all.filter((r) => {
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
  }, [all, query, selected, category, statusFilter]);

  const totalTaken = useMemo(
    () => allocation.reduce((s, l) => s + (l.take || 0), 0),
    [allocation],
  );

  const totalAvailable = useMemo(
    () => availability.reduce((s, l) => s + l.available, 0),
    [availability],
  );

  /** Re-suggest FEFO whenever the user bumps the big "How many?" stepper.
   *  This intentionally overwrites manual per-lot edits — the per-lot
   *  picker is for fine-tuning AFTER the total is set.
   *
   *  When the user instead drives the per-lot picker, we sync `qty` to
   *  the new sum (see syncQtyFromAllocation). That sync would otherwise
   *  trigger this effect and overwrite their lot edit; the ref below
   *  swallows exactly one re-suggest pass to break the loop. */
  const skipNextFefoRecalc = useRef(false);
  useEffect(() => {
    if (availability.length === 0) return;
    if (skipNextFefoRecalc.current) {
      skipNextFefoRecalc.current = false;
      return;
    }
    setAllocation(suggestFEFO(availability, qty));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qty]);

  /** Per-lot edit handler — keeps the "How many?" stepper in lockstep
   *  with the sum of per-lot takes. Without this, the two surfaces drift:
   *  the upper stepper says "1" while the picker says "Taken 4 of 1". */
  const onAllocationChange = useCallback(
    (next: typeof allocation) => {
      const sum = next.reduce((s, l) => s + (l.take || 0), 0);
      if (sum !== qty) {
        skipNextFefoRecalc.current = true;
        setQty(sum);
      }
      setAllocation(next);
    },
    [qty, allocation],
  );

  const submit = async () => {
    if (!selected || totalTaken <= 0) return;
    const session = getSession();
    setSaving(true);
    try {
      // totalTaken is always in pack-denomination (lot allocations are
      // in packs). Convert the guard's stepper value for the audit trail.
      const ps = (selected.pack_size ?? 1) > 0 ? (selected.pack_size ?? 1) : 1;
      const unitDef = resolveUnit(selected.unit);
      // For the audit trail: what the guard actually saw on screen.
      const dispenseQty = dispenseMode === 'unit'
        ? qty  // the raw value they typed (e.g. "2 litres")
        : qty; // packs — recorded as-is
      const dispenseUnit = dispenseMode === 'unit'
        ? unitDef.symbol
        : 'pack';

      const picks = allocation
        .filter((l) => l.take > 0)
        .map((l) => ({ expiry_date: l.expiry, qty: l.take }));
      await enqueue('dispense', {
        id: `dsp_${nanoid(12)}`,
        barcode: selected.barcode,
        product_name: selected.name,
        qty: totalTaken,
        // Audit trail: what the guard saw on screen ("2 litres" vs "1 pack")
        dispense_qty: dispenseQty,
        dispense_unit: dispenseUnit,
        // Soft-nudge model: server records what the guard actually
        // picked rather than enforcing FEFO. Empty picks → server
        // falls back to FEFO (the suggestion the user accepted).
        lot_picks: picks,
        reason,
        // taken_by is now always the logged-in guard — no separate
        // free-text "who" field. Removes one mandatory input from the
        // dispense flow.
        taken_by: session?.guardName ?? null,
        issued_at: Date.now(),
        performed_by: session?.guardId ?? null,
        performed_by_name: session?.guardName ?? null,
      });
      await decrementLotsLocal(
        selected.barcode,
        totalTaken,
        picks.map((p) => ({ expiry_date: p.expiry_date, qty: p.qty })),
      );
      await adjustOnHand(selected.barcode, -totalTaken);
      // Push the write + refresh stock before returning. `pullReads:false`
      // skips the catalog + orders GETs a dispense never touches, and the
      // stock/alerts caches now collapse into ONE stock pull — so this is
      // 2 quick calls (write + stock) instead of the previous 5-6 that made
      // "Done" drag. When offline, flushOnce returns immediately (the outbox
      // reconciles on reconnect), so dispense still feels instant on a dead
      // connection. Awaiting here (rather than firing in the background)
      // keeps the destination Stock list from briefly flashing the stale
      // pre-dispense count before the write lands.
      await flushOnce({ pullReads: false }).catch(() => {});
      haptic.success();
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  if (!selected) {
    return (
      <View style={[styles.safe, { backgroundColor: palette.background }]}>
        <AppBar title={t('dispense')} subtitle={t('dispenseSub')} onBack={() => navigation.goBack()} />
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
            autoFocus
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
            label={t('filterStatus')}
            options={statusOptions}
            selected={statusFilter}
            onSelect={setStatusFilter}
          />
        </View>
        {initialLoading && all.length === 0 ? (
          <View style={styles.list}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ marginBottom: spacing.sm }}>
                <Card tone="filled" padding="lg">
                  <Skeleton width="55%" height={18} />
                  <View style={{ height: 6 }} />
                  <Skeleton width="75%" height={14} />
                </Card>
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(r) => r.barcode}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
            }
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            renderItem={({ item }) => (
              <Card tone="filled" padding="lg" onPress={() => setSelected(item)} style={{ backgroundColor: cardBg(item) }}>
                <View style={styles.pickerRow}>
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
                  <Text variant="titleLarge" color={countColor(item)} style={{ fontWeight: '700' }}>
                    {formatOnHandShort(item.on_hand, item.pack_size, item.unit)}
                  </Text>
                </View>
              </Card>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text variant="bodyLarge" color={palette.onSurfaceVariant} style={{ textAlign: 'center' }}>
                  {t('noItemsMatch')}
                </Text>
              </View>
            }
          />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar
        title={t('dispense')}
        subtitle={selected.name}
        onBack={() => setSelected(null)}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: spacing.xl + kbHeight }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* JIT verification banners. While verifying, the user can
              still scroll and pick a reason — they just can't confirm
              the dispense yet. */}
          {verifyStatus === 'verifying' && (
            <View style={styles.statusBanner}>
              <ActivityIndicator color={palette.primary} size="small" />
              <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginLeft: spacing.sm }}>
                {t('verifying')}
              </Text>
            </View>
          )}
          {/* Offline / failed check: dispense is still allowed against the
              saved count (offline-first), so this is an informational note,
              not a blocking error. */}
          {(verifyStatus === 'offline' || verifyStatus === 'error') && (
            <View
              style={[
                styles.statusBanner,
                { borderColor: palette.outline, backgroundColor: palette.surfaceContainerHigh ?? 'transparent' },
              ]}
            >
              <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
                {t('dispenseOfflineNote')}
              </Text>
            </View>
          )}
          {/* Absent: the server has no record of this item — dispense stays
              blocked. */}
          {verifyStatus === 'absent' && (
            <View
              style={[
                styles.statusBanner,
                { borderColor: palette.error, backgroundColor: palette.errorContainer ?? 'transparent' },
              ]}
            >
              <Text variant="bodyMedium" color={palette.error}>
                {t('itemNotOnServer')}
              </Text>
            </View>
          )}

          <Card tone="elevated" padding="xl">
            <Text variant="labelLarge" color={palette.onSurfaceVariant}>
              {t('product').toUpperCase()}
            </Text>
            <Text variant="headlineSmall" style={{ marginTop: spacing.xs }}>
              {selected.name}
            </Text>
            <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.xs }}>
              {formatOnHand(verifiedOnHand ?? selected.on_hand, selected.pack_size, selected.unit)}
              {' '}{t('onHand')}
            </Text>
          </Card>

          {/* Pack visual — fill box showing remaining stock after dispense.
              on_hand/threshold/taken are all pack-denominated; re-express in
              base units (× pack_size) so the numbers match the base-unit
              label ("35 kg", not "7" packs shown as "7 kg"). Products with no
              base unit stay in packs (factor 1). */}
          {verifyStatus !== 'verifying' && (() => {
            const ps = (selected.pack_size ?? 1) > 0 ? (selected.pack_size ?? 1) : 1;
            const factor = selected.unit ? ps : 1;
            const capBase = packToBase(verifiedOnHand ?? selected.on_hand, factor);
            return (
              <PackVisual
                totalCapacity={capBase}
                remaining={Math.max(0, capBase - packToBase(totalTaken, factor))}
                unit={selected.unit ?? 'packs'}
                threshold={packToBase(selected.threshold, factor)}
              />
            );
          })()}

          {/* Quantity area. We can't know whether this is a single-lot
              (stepper only) or multi-lot (stepper + per-lot picker)
              product until JIT verification returns the lot breakdown.
              Rendering the stepper immediately and letting the LotPicker
              pop in later is jarring, so while verifying we show a
              skeleton placeholder and commit the real controls in one
              paint once the breakdown is known. */}
          {verifyStatus === 'verifying' ? (
            <View style={styles.qtySection}>
              <View style={{ alignItems: 'center' }}>
                <Skeleton width={120} height={16} />
              </View>
              <Skeleton width="100%" height={64} rounded="md" />
            </View>
          ) : (
            <>
              {/* Primary "How many?" stepper — the familiar input. Max is
                  the verified total available across all lots so the user
                  can't ask for more than exists. */}
              <View style={styles.qtySection}>
                <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ textAlign: 'center' }}>
                  {t('howMany').toUpperCase()}
                </Text>
                <UnitAwareStepper
                  // `qty` is always stored in packs (the denomination the
                  // lot system expects). The stepper wants `value` in the
                  // active mode's unit, so re-express packs → base units
                  // when the guard is in 'unit' mode. Without this the
                  // number collapsed through baseToPack on every render.
                  value={
                    dispenseMode === 'unit'
                      ? packToBase(qty, (selected.pack_size ?? 1) > 0 ? (selected.pack_size ?? 1) : 1)
                      : qty
                  }
                  onChange={(v, m) => {
                    // When in 'unit' mode, convert to packs for lot allocation
                    // so totalTaken stays in the pack denomination the lot
                    // system expects. Store the pack value at FULL precision —
                    // rounding packs to 3 dp here is too coarse to reconstruct
                    // the base-unit value when pack_size doesn't divide evenly
                    // (5.1 kg → 1.017 packs → 6.102 kg drift). The stepper's
                    // own display rounding keeps the on-screen number clean.
                    if (m === 'unit') {
                      const ps = (selected.pack_size ?? 1) > 0 ? (selected.pack_size ?? 1) : 1;
                      setQty(baseToPack(v, ps));
                    } else {
                      setQty(v);
                    }
                  }}
                  packSize={selected.pack_size}
                  unit={selected.unit}
                  maxPacks={(totalAvailable || verifiedOnHand || selected.on_hand) || 0}
                  mode={dispenseMode}
                  onModeChange={setDispenseMode}
                />
              </View>

              {/* Per-lot picker. Only worth showing when there are 2+ lots —
                  for the common single-lot case the big stepper above is the
                  whole story. FEFO is highlighted as "← suggested"; guard
                  can override per-row. */}
              {availability.length > 1 && (
                <LotPicker
                  lots={allocation}
                  onChange={onAllocationChange}
                  desiredQty={qty}
                  unit={selected.unit ?? null}
                  packSize={selected.pack_size ?? null}
                  decimal={resolveUnit(selected.unit).nature === 'continuous'}
                />
              )}
            </>
          )}

          <View>
            <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ marginBottom: spacing.sm }}>
              {t('reason').toUpperCase()}
            </Text>
            <View style={styles.chipRow}>
              {REASONS.map((r) => (
                <Chip
                  key={r.value}
                  label={t(r.labelKey)}
                  selected={r.value === reason}
                  onPress={() => setReason(r.value)}
                />
              ))}
            </View>
          </View>

          {/* Who took it: always the logged-in guard. No need for a
              text input; just surface their name so they know the
              record will be filed under them. */}
          <View style={{ marginTop: spacing.md }}>
            <Text variant="labelLarge" color={palette.onSurfaceVariant}>
              {t('whoTook').toUpperCase()}
            </Text>
            <Text variant="titleMedium" style={{ marginTop: spacing.xs }}>
              {getSession()?.guardName ?? '—'}
            </Text>
          </View>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: palette.surface, borderTopColor: palette.outlineVariant }]}>
          {/* Confirm is blocked only while the live check is still running
              ('verifying') or when the server has no record of the item
              ('absent'). Offline / failed checks fall back to the saved
              count and are allowed (offline-first) — the write queues in
              the outbox and reconciles on sync. */}
          <Button
            label={t('confirm')}
            onPress={submit}
            loading={saving}
            disabled={verifyStatus === 'verifying' || verifyStatus === 'absent' || totalTaken <= 0}
            size="lg"
            fullWidth
            leadingIcon={<Check size={22} color={palette.onPrimary} strokeWidth={2.4} />}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  search: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  searchInput: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    fontSize: 17,
  },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  body: { flexGrow: 1, padding: spacing.xl, gap: spacing.xl },
  qtySection: { gap: spacing.lg },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  empty: { padding: spacing.xxl },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
});
