import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AlertTriangle,
  Briefcase,
  CalendarDays,
  CloudOff,
  Coffee,
  HandCoins,
  Layers,
  MoreHorizontal,
  Search,
  SprayCan,
  Tag,
  UserRound,
  Wrench,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react-native';
import { nanoid } from 'nanoid/non-secure';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  AppBar,
  Button,
  Chip,
  IconBadge,
  RowDivider,
  Skeleton,
  spacing,
  StatusChip,
  Text,
} from '../../../design';
import { AmountStepper } from '../../../components/AmountStepper';
import { PackTile } from '../../../components/PackTile';
import {
  formatOnHandShort,
  formatSmall,
  productShape,
  quickAmounts,
  smallPerPack,
  smallStep,
  smallUnit,
} from '../../../units';
import { enqueue } from '../../../db/outbox';
import { adjustOnHand, findStock, getNearestExpiry, listStock, StockRow, statusFor } from '../../../db/stock';
import { decrementLotsLocal, listLots } from '../../../db/lots';
import { pullStockIntoCache } from '../../../sync/stockPull';
import { LotAllocation, suggestFEFO } from '../components/LotPicker';
import { UseFirstRows } from '../components/UseFirstRows';
import { closedPacksText, PackShelf, packsText, shelfText, SingleShelf } from '../components/Shelf';
import { allocateTake, takePlan } from '../countMath';
import { categoryIcon } from '../categoryIcon';
import { getSession } from '../../../auth/session';
import { useT } from '../../../i18n';
import { useCan } from '../../../auth';
import { NoPermission } from '../../../components/NoPermission';
import { StringKey } from '../../../i18n/strings';
import { RootStackParamList } from '../../../navigation/types';
import { api, ApiError } from '../../../sync/api';
import { flushOnce } from '../../../sync/syncService';
import { invalidateRefetchThrottle, refetchThrottled } from '../../../sync/refetch';
import { haptic } from '../../../utils/haptics';
import { useKeyboardHeight } from '../../../hooks/useKeyboardHeight';
import { useTheme } from '../../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Dispense'>;

// `value` is the canonical English string recorded on the dispense; only
// the displayed label is translated, so reporting/grouping stays stable
// regardless of the guard's chosen language.
const REASONS: { value: string; labelKey: StringKey; Icon: LucideIcon }[] = [
  { value: 'Office use', labelKey: 'reasonOfficeUse', Icon: Briefcase },
  { value: 'Pantry', labelKey: 'reasonPantry', Icon: Coffee },
  { value: 'Cleaning', labelKey: 'reasonCleaning', Icon: SprayCan },
  { value: 'Maintenance', labelKey: 'reasonMaintenance', Icon: Wrench },
  { value: 'Other', labelKey: 'reasonOther', Icon: MoreHorizontal },
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

/**
 * Where a fresh take-out opens. Single items start at one (the usual
 * take). Pack items start empty: whether someone wants a closed pack or a
 * scoop from the open one is theirs to say, and a wrong guess is worse
 * than one tap.
 */
function startingTake(row: StockRow, available: number): { closed: number; loose: number } {
  if (productShape(row.pack_size, row.unit) === 'single') return { closed: Math.min(1, Math.floor(available + 1e-9)), loose: 0 };
  return { closed: 0, loose: 0 };
}

export function DispenseScreen({ route, navigation }: Props) {
  const t = useT();
  const can = useCan();
  const { palette } = useTheme();
  const kbHeight = useKeyboardHeight();
  const initialBarcode = route.params?.barcode;
  const [selected, setSelected] = useState<StockRow | null>(null);
  const [all, setAll] = useState<StockRow[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  // What is in their hand, the way the shelf looks: closed packs picked up
  // whole, plus a loose amount (pieces, grams, ml) from the open pack. For
  // single items `closedTake` is simply how many.
  const [closedTake, setClosedTake] = useState(0);
  const [looseTake, setLooseTake] = useState(0);
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
  /** Per-lot availability, FEFO-ordered (earliest first). Which lot each
   *  part of the take comes from is worked out from it (see `allocation`);
   *  `manualAlloc` holds a person's own "use first" choice for whole packs
   *  until they change the amount again. */
  const [manualAlloc, setManualAlloc] = useState<LotAllocation[] | null>(null);
  const [availability, setAvailability] = useState<{ expiry: string | null; available: number }[]>([]);

  const categories = useMemo(
    () => Array.from(new Set(all.map((r) => r.category).filter(Boolean) as string[])).sort(),
    [all],
  );

  // Pull the latest stock from the server and replace the local cache,
  // then re-read SQLite into the picker list. Mirrors StockScreen so the
  // dispense picker stays in sync with the source of truth — without this
  // it only ever showed whatever warmCache last left behind. Shares the
  // 'stock' refetch key with Stock/Alerts (same stock_levels table).
  const fetchRemote = useCallback(async () => {
    await flushOnce().catch(() => {});
    await pullStockIntoCache();
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
        const start = startingTake(selected, remoteQty);
        setClosedTake(start.closed);
        setLooseTake(start.loose);
        setManualAlloc(null);

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
        const start = startingTake(selected, cachedQty);
        setClosedTake(start.closed);
        setLooseTake(start.loose);
        setManualAlloc(null);
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
        setVerifyStatus(isOfflineError(err) ? 'offline' : 'error');
      } finally {
        clearTimeout(t);
      }
    })();
    return () => { cancelled = true; clearTimeout(t); controller.abort(); };
    // intentionally NOT in deps: the amounts would re-run the JIT on every
    // stepper tap; only refire when the selected barcode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.barcode]);

  const results = useMemo(() => {
    if (selected) return [];
    const q = query.trim().toLowerCase();
    // No cap: FlatList virtualizes. Items that are out sort last (they
    // cannot be taken out) but stay visible so nobody wonders where they went.
    return all
      .filter((r) => {
        if (category !== 'All' && r.category !== category) return false;
        if (!q) return true;
        return r.name.toLowerCase().includes(q) || r.barcode.includes(q) || (r.category ?? '').toLowerCase().includes(q);
      })
      .sort((a, b) => Number(a.on_hand <= 0) - Number(b.on_hand <= 0) || a.name.localeCompare(b.name));
  }, [all, query, selected, category]);

  const isSingle = selected ? productShape(selected.pack_size, selected.unit) === 'single' : true;
  const perPack = selected ? smallPerPack(selected.pack_size, selected.unit) : 1;

  /** Which dated batch each part of the take comes from, in packs. Loose
   *  amounts come out of the open pack's batch first, closed packs oldest
   *  first (allocateTake). A person's own "use first" pick wins until they
   *  change the amount. */
  const allocation = useMemo<LotAllocation[]>(() => {
    if (manualAlloc) return manualAlloc;
    if (isSingle) return suggestFEFO(availability, closedTake);
    const takes = allocateTake(availability, perPack, closedTake, looseTake);
    return availability.map((l, i) => ({ ...l, take: takes[i] }));
  }, [manualAlloc, isSingle, availability, perPack, closedTake, looseTake]);

  const totalTaken = useMemo(
    () => allocation.reduce((s, l) => s + (l.take || 0), 0),
    [allocation],
  );

  const totalAvailable = useMemo(
    () => availability.reduce((s, l) => s + l.available, 0),
    [availability],
  );

  const setClosed = useCallback((n: number) => {
    setManualAlloc(null);
    setClosedTake(n);
  }, []);
  const setLoose = useCallback((n: number) => {
    setManualAlloc(null);
    setLooseTake(n);
  }, []);

  /** "Use first" edits (whole packs only): the sum becomes the count. */
  const onAllocationChange = useCallback((next: LotAllocation[]) => {
    setManualAlloc(next);
    setClosedTake(Math.round(next.reduce((s, l) => s + (l.take || 0), 0)));
  }, []);

  const submit = async () => {
    if (!selected || totalTaken <= 0) return;
    const session = getSession();
    setSaving(true);
    try {
      // totalTaken is always in packs (lot allocations are in packs).
      // The audit keeps what they chose on screen: whole packs as packs;
      // anything loose as the small unit ("200 g", "14 pcs").
      const loose = !isSingle && looseTake > 0;
      const dispenseQty = loose ? closedTake * perPack + looseTake : closedTake;
      const dispenseUnit = loose ? smallUnit(selected.unit).symbol : 'pack';

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

  // Reached without the right role (old deep link, role changed meanwhile).
  // After every hook on purpose: hooks must run in the same order each render.
  if (!can('inventory.issue')) {
    return <NoPermission title={t('dispense')} onBack={() => navigation.goBack()} />;
  }

  if (!selected) {
    return (
      <View style={[styles.safe, { backgroundColor: palette.background }]}>
        <AppBar title={t('takeOutAction')} onBack={() => navigation.goBack()} />
        <View style={[styles.search, { backgroundColor: palette.surfaceContainerLow, borderColor: palette.outlineVariant }]}>
          <Search size={20} color={palette.onSurfaceVariant} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('searchItem')}
            placeholderTextColor={palette.onSurfaceVariant}
            style={[styles.searchInput, { color: palette.onSurface }]}
            autoFocus
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={12} accessibilityLabel="Clear">
              <X size={20} color={palette.onSurfaceVariant} />
            </Pressable>
          ) : null}
        </View>
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            <Chip label={t('filterAll')} Icon={Layers} selected={category === 'All'} onPress={() => setCategory('All')} />
            {categories.map((c) => (
              <Chip key={c} label={c} Icon={categoryIcon(c)} selected={category === c} onPress={() => setCategory(c)} />
            ))}
          </ScrollView>
        </View>
        {initialLoading && all.length === 0 ? (
          <View>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.skeletonRow}>
                <Skeleton width={48} height={48} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Skeleton width="55%" height={16} />
                  <Skeleton width="30%" height={12} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(r) => r.barcode}
            contentContainerStyle={{ paddingBottom: spacing.xxxl }}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
            ItemSeparatorComponent={() => <RowDivider />}
            renderItem={({ item }) => {
              const status = statusFor(item);
              const out = item.on_hand <= 0;
              return (
                <Pressable
                  onPress={() => {
                    if (out) {
                      haptic.warn();
                      return;
                    }
                    haptic.tap();
                    setSelected(item);
                  }}
                  android_ripple={out ? undefined : { color: palette.surfaceContainerHigh }}
                  style={[styles.pickRow, out && { opacity: 0.45 }]}
                >
                  <IconBadge Icon={categoryIcon(item.category)} size={48} />
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium" numberOfLines={1} style={{ fontWeight: '600' }}>
                      {item.name}
                    </Text>
                    <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
                      {t('inStoreAmount', { amount: formatOnHandShort(item.on_hand, item.pack_size, item.unit) })}
                    </Text>
                  </View>
                  {status !== 'ok' ? (
                    <StatusChip label={out ? t('outOfStock') : t('lowChip')} tone={out ? 'danger' : 'warn'} />
                  ) : null}
                </Pressable>
              );
            }}
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

  const inStore = verifiedOnHand ?? selected.on_hand;
  const shape = productShape(selected.pack_size, selected.unit);
  const Icon = categoryIcon(selected.category);
  const available = totalAvailable || inStore || 0;
  const totalSmall = Math.round(available * perPack);
  const plan = takePlan(totalSmall, perPack, closedTake, looseTake);
  const maxLoose = Math.max(0, totalSmall - closedTake * perPack);
  // Closed packs left after the loose amount has opened what it needs.
  const maxClosed = Math.max(0, plan.sealed - Math.ceil(Math.max(0, looseTake - plan.open) / perPack));
  const canTakeClosed = closedTake < maxClosed;
  const hasClosed = plan.sealed > 0 || closedTake > 0;
  const step = smallStep(selected.pack_size, selected.unit);
  const quick = shape === 'measurePack' ? quickAmounts(selected.pack_size, selected.unit).filter((v) => v <= maxLoose) : [];
  const small = smallUnit(selected.unit);
  const after = Math.max(0, inStore - totalTaken);
  const afterStatus = after <= 1e-9 ? 'out' : after <= selected.threshold ? 'low' : 'ok';
  const afterColor = afterStatus === 'out' ? palette.error : afterStatus === 'low' ? palette.amber : palette.onSurfaceVariant;
  const amountTaken = isSingle
    ? formatOnHandShort(closedTake, selected.pack_size, selected.unit)
    : [closedTake > 0 ? packsText(t, closedTake) : '', looseTake > 0 ? formatSmall(looseTake, selected.unit) : ''].filter(Boolean).join(' + ');
  const leftText = isSingle
    ? formatOnHandShort(after, selected.pack_size, selected.unit)
    : shelfText(t, Math.max(0, totalSmall - closedTake * perPack - looseTake), perPack, selected.unit);

  // What to do, in order, the way it happens at the shelf.
  const steps: string[] = [];
  if (!isSingle) {
    if (closedTake > 0) steps.push(t('stepPickClosed', { count: closedPacksText(t, closedTake) }));
    if (plan.fromOpen > 0) {
      steps.push(plan.opened.length > 0
        ? t('stepEmptyOpen', { amount: formatSmall(plan.fromOpen, selected.unit) })
        : t('stepFromOpen', { amount: formatSmall(plan.fromOpen, selected.unit) }));
    }
    plan.opened.forEach((take) => steps.push(t('stepOpenNew', { amount: formatSmall(take, selected.unit) })));
  }
  // "Use first" by date works in whole packs; a loose amount always comes
  // out of the open pack, so it is not offered then.
  const showUseFirst = availability.length > 1 && looseTake === 0 && availability.every((l) => Number.isInteger(l.available));

  return (
    <View style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar
        title={t('takeOutAction')}
        // Opened for one item (from its sheet): back leaves. Picked here: back to the list.
        onBack={() => (initialBarcode ? navigation.goBack() : setSelected(null))}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: spacing.xl + kbHeight }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* What is being taken. */}
          <View style={styles.product}>
            <IconBadge Icon={Icon} size={56} />
            <View style={{ flex: 1 }}>
              <Text variant="titleLarge" style={{ fontWeight: '700' }} numberOfLines={2}>
                {selected.name}
              </Text>
              <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
                {isSingle
                  ? t('inStoreAmount', { amount: formatOnHandShort(inStore, selected.pack_size, selected.unit) })
                  : shelfText(t, totalSmall, perPack, selected.unit)}
              </Text>
            </View>
          </View>

          {/* Live count check. Offline still allows taking out against the
              saved count (it queues); only "absent" blocks. */}
          {verifyStatus === 'verifying' ? (
            <View style={styles.note}>
              <ActivityIndicator color={palette.primary} size="small" />
              <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
                {t('checkingCount')}
              </Text>
            </View>
          ) : null}
          {verifyStatus === 'offline' || verifyStatus === 'error' ? (
            <View style={[styles.note, styles.noteBox, { backgroundColor: palette.surfaceContainerLow }]}>
              <CloudOff size={20} color={palette.onSurfaceVariant} />
              <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ flex: 1 }}>
                {t('dispenseOfflineNote')}
              </Text>
            </View>
          ) : null}
          {verifyStatus === 'absent' ? (
            <View style={[styles.note, styles.noteBox, { backgroundColor: palette.errorContainer }]}>
              <XCircle size={20} color={palette.onErrorContainer} />
              <Text variant="bodyMedium" color={palette.onErrorContainer} style={{ flex: 1 }}>
                {t('itemNotOnServer')}
              </Text>
            </View>
          ) : null}

          {verifyStatus === 'verifying' ? (
            <View style={{ gap: spacing.md }}>
              <Skeleton width="100%" height={120} rounded="md" />
              <Skeleton width="60%" height={18} />
              <Skeleton width="100%" height={64} rounded="md" />
            </View>
          ) : (
            <>
              {/* The shelf as it really is; what goes in your hand is purple. */}
              <View style={{ gap: spacing.sm }}>
                <Text variant="labelLarge" color={palette.onSurfaceVariant} style={styles.label}>
                  {t('onTheShelf')}
                </Text>
                {isSingle ? (
                  <SingleShelf Icon={Icon} count={available} taking={closedTake} legend={totalTaken > 0} />
                ) : (
                  <PackShelf
                    Icon={Icon}
                    perPack={perPack}
                    totalSmall={totalSmall}
                    unit={selected.unit}
                    closedTaken={closedTake}
                    looseTaken={looseTake}
                    onTakeClosed={canTakeClosed ? () => setClosed(closedTake + 1) : undefined}
                    onReturnClosed={() => setClosed(Math.max(0, closedTake - 1))}
                    // The purple key only means something once purple is on screen.
                    legend={totalTaken > 0}
                  />
                )}
              </View>

              {/* One counter for each thing you can hold, then what to do and
                  what stays: read together, so they sit close together. */}
              <View style={{ gap: spacing.md }}>
                <View style={{ gap: spacing.sm }}>
                  <Text variant="labelLarge" color={palette.onSurfaceVariant} style={styles.label}>
                    {t('inYourHand')}
                  </Text>
                  {isSingle ? (
                    <View style={[styles.counters, { borderColor: palette.outlineVariant }]}>
                      <HandCounter
                        tile={<PackTile kind="single" Icon={Icon} size="sm" />}
                        title={t('howManyTaking')}
                        sub={t('inStoreAmount', { amount: formatOnHandShort(available, selected.pack_size, selected.unit) })}
                        value={closedTake}
                        onChange={setClosed}
                        max={Math.floor(available + 1e-9)}
                        unitLabel={formatOnHandShort(closedTake, selected.pack_size, selected.unit).replace(/^\S+\s*/, '')}
                      />
                    </View>
                  ) : (
                    <View style={[styles.counters, { borderColor: palette.outlineVariant }]}>
                      {/* No closed pack on the shelf: no counter that could only say 0. */}
                      {hasClosed ? (
                      <>
                      <HandCounter
                        tile={<PackTile kind="closed" Icon={Icon} size="sm" />}
                        title={t('closedPacksTitle')}
                        sub={t('inEachPack', { amount: formatSmall(perPack, selected.unit) })}
                        value={closedTake}
                        onChange={setClosed}
                        max={maxClosed}
                        unitLabel={t(closedTake === 1 ? 'packOne' : 'packMany')}
                      />
                      <View style={[styles.counterRule, { backgroundColor: palette.outlineVariant }]} />
                      </>
                      ) : null}
                      <HandCounter
                        tile={<PackTile kind="open" Icon={Icon} size="sm" fill={0.5} />}
                        title={t('fromOpenPackTitle')}
                        value={looseTake}
                        onChange={setLoose}
                        max={maxLoose}
                        step={step}
                        unitLabel={looseTake >= small.perBase && small.perBase > 1 ? formatSmall(looseTake, selected.unit) : small.symbol}
                      >
                        {quick.length > 0 ? (
                          <View style={styles.quickRow}>
                            {quick.map((v) => (
                              <QuickAmount key={v} label={formatSmall(v, selected.unit)} on={looseTake === v} onPress={() => setLoose(v)} />
                            ))}
                          </View>
                        ) : null}
                      </HandCounter>
                    </View>
                  )}
                </View>

                {!isSingle ? (
                  <View style={[styles.steps, { backgroundColor: palette.primaryContainer }]}>
                    {steps.length === 0 ? (
                      <Text variant="bodyLarge" color={palette.onPrimaryContainer}>
                        {t('tapPlusHint')}
                      </Text>
                    ) : (
                      steps.map((line, i) => (
                        <View key={i} style={styles.stepRow}>
                          <View style={[styles.stepNum, { backgroundColor: palette.primary }]}>
                            <Text variant="labelMedium" color={palette.onPrimary} style={{ fontWeight: '800', letterSpacing: 0 }}>
                              {i + 1}
                            </Text>
                          </View>
                          <Text variant="bodyLarge" color={palette.onPrimaryContainer} style={{ flex: 1, fontWeight: '600' }}>
                            {line}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                ) : null}

                <View style={styles.afterRow}>
                  {afterStatus !== 'ok' ? <AlertTriangle size={18} color={afterColor} /> : null}
                  <Text variant="bodyLarge" color={afterColor} style={{ flex: 1, fontWeight: afterStatus === 'ok' ? '400' : '700' }}>
                    {t('leftOnShelf', { amount: leftText })}
                  </Text>
                </View>
              </View>

              {availability.length > 1 && !showUseFirst && totalTaken > 0 ? (
                <View style={styles.note}>
                  <CalendarDays size={20} color={palette.onSurfaceVariant} />
                  <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
                    {t('takenFromOldest')}
                  </Text>
                </View>
              ) : null}
              {showUseFirst && totalTaken > 0 ? (
                <View>
                  <Question Icon={CalendarDays} text={t('useOldestFirst')} />
                  <UseFirstRows lots={allocation} onChange={onAllocationChange} />
                </View>
              ) : null}
            </>
          )}

          <View>
            <Question Icon={Tag} text={t('whatIsItFor')} />
            <View style={styles.reasonGrid}>
              {REASONS.map((r) => {
                const on = r.value === reason;
                return (
                  <Pressable
                    key={r.value}
                    onPress={() => {
                      haptic.tap();
                      setReason(r.value);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[
                      styles.reason,
                      {
                        borderColor: on ? palette.primary : palette.outlineVariant,
                        borderWidth: on ? 2 : 1,
                        backgroundColor: on ? palette.primaryContainer : palette.surfaceContainerLowest,
                      },
                    ]}
                  >
                    <r.Icon size={26} color={on ? palette.onPrimaryContainer : palette.onSurfaceVariant} />
                    <Text variant="labelLarge" color={on ? palette.onPrimaryContainer : palette.onSurface} numberOfLines={1} style={{ fontWeight: on ? '700' : '500' }}>
                      {t(r.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Always the signed-in person: no field to fill, just shown. */}
          <View style={styles.note}>
            <UserRound size={20} color={palette.onSurfaceVariant} />
            <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
              {t('takenByName', { name: getSession()?.guardName ?? '' })}
            </Text>
          </View>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: palette.background, borderTopColor: palette.outlineVariant }]}>
          {/* Blocked only while the live check runs or when the server has
              no record of the item ('absent'). Offline falls back to the
              saved count (offline-first): the write queues and reconciles. */}
          <Button
            label={totalTaken > 0 ? t('takeOutAmount', { amount: amountTaken }) : t('takeOutAction')}
            onPress={submit}
            loading={saving}
            disabled={verifyStatus === 'verifying' || verifyStatus === 'absent' || totalTaken <= 0}
            size="lg"
            fullWidth
            Icon={HandCoins}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * One thing you can hold, with its picture: closed packs, or a loose
 * amount from the open pack. The number is typed or stepped.
 */
function HandCounter({
  tile,
  title,
  sub,
  value,
  onChange,
  max,
  step,
  unitLabel,
  children,
}: {
  tile: React.ReactNode;
  title: string;
  sub?: string;
  value: number;
  onChange: (n: number) => void;
  max: number;
  step?: number;
  unitLabel: string;
  children?: React.ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.counter}>
      <View style={styles.counterHead}>
        <View style={styles.counterTile}>{tile}</View>
        <View style={{ flex: 1 }}>
          <Text variant="titleMedium" style={{ fontWeight: '700' }}>
            {title}
          </Text>
          {sub ? (
            <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
              {sub}
            </Text>
          ) : null}
        </View>
      </View>
      <AmountStepper compact value={value} onChange={onChange} min={0} max={max} step={step} unitLabel={unitLabel} />
      {children}
    </View>
  );
}

/**
 * A one-tap amount. All of them share the row equally, and a long label
 * ("2 kg 500 g") shrinks to fit instead of pushing the row out of line.
 */
function QuickAmount({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[
        styles.quick,
        {
          borderColor: on ? palette.primary : palette.outlineVariant,
          backgroundColor: on ? palette.primaryContainer : palette.surfaceContainerLowest,
        },
      ]}
    >
      <Text
        variant="labelLarge"
        color={on ? palette.onPrimaryContainer : palette.onSurface}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        style={{ fontWeight: on ? '700' : '600', letterSpacing: 0 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A question with its picture, so the icon carries it before the words do. */
function Question({ Icon, text }: { Icon: LucideIcon; text: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.questionRow}>
      <View style={[styles.questionIcon, { backgroundColor: palette.primaryContainer }]}>
        <Icon size={22} color={palette.onPrimaryContainer} />
      </View>
      <Text variant="titleMedium" style={{ fontWeight: '700', flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
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
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, minHeight: 72, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  empty: { padding: spacing.xxl },
  body: { flexGrow: 1, padding: spacing.xl, gap: spacing.xxl },
  product: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  noteBox: { padding: spacing.md, borderRadius: 14 },
  questionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  questionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '700' },
  afterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  counters: { borderWidth: 1, borderRadius: 18, paddingHorizontal: spacing.lg },
  counter: { paddingVertical: spacing.md, gap: spacing.md },
  counterHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  counterTile: { width: 36, alignItems: 'center' },
  steps: { borderRadius: 16, padding: spacing.md, gap: spacing.sm },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepNum: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickRow: { flexDirection: 'row', gap: spacing.sm },
  quick: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs },
  counterRule: { height: StyleSheet.hairlineWidth },
  reason: {
    width: '31.5%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: 16,
  },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
