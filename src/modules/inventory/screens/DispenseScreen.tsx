import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check } from 'lucide-react-native';
import { nanoid } from 'nanoid/non-secure';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
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
  QtyStepper,
  radius,
  Skeleton,
  spacing,
  Text,
} from '../../../design';
import { enqueue } from '../../../db/outbox';
import { adjustOnHand, findStock, listStock, StockRow, statusFor } from '../../../db/stock';
import { decrementLotsLocal, listLots } from '../../../db/lots';
import { LotAllocation, LotPicker, suggestFEFO } from '../components/LotPicker';
import { getSession } from '../../../auth/session';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { api, ApiError } from '../../../sync/api';
import { flushOnce } from '../../../sync/syncService';
import { haptic } from '../../../utils/haptics';
import { useKeyboardHeight } from '../../../hooks/useKeyboardHeight';
import { FilterDropdown, FilterOption } from '../components/FilterDropdown';
import { useTheme } from '../../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Dispense'>;

const REASONS = ['Office use', 'Pantry', 'Cleaning', 'Maintenance', 'Other'];

const STATUS_OPTIONS: FilterOption[] = [
  { key: 'All', label: 'All Status' },
  { key: 'In Stock', label: 'In Stock' },
  { key: 'Low', label: 'Low' },
  { key: 'Out', label: 'Out of Stock' },
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
  const [reason, setReason] = useState(REASONS[0]);
  const [saving, setSaving] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

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
    return [{ key: 'All', label: 'All Categories' }, ...Array.from(cats).sort().map((c) => ({ key: c, label: c }))];
  }, [all]);

  useEffect(() => {
    listStock().then((rows) => {
      setAll(rows);
      setInitialLoading(false);
    });
  }, []);

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
        // Clamp qty to the verified ceiling. If the user had a stale
        // higher qty in mind (e.g. local cache said 10, server says 7),
        // drop to the new max so they can't accidentally submit over.
        const minStep = selected.dispense_mode === 'divisible' ? 0.001 : 1;
        const clampedQty = qty > remoteQty ? Math.max(minStep, remoteQty) : qty;
        if (clampedQty !== qty) setQty(clampedQty);

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
        setAllocation(suggestFEFO(nextAvailability, clampedQty));
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
    return all
      .filter((r) => {
        if (category !== 'All' && r.category !== category) return false;
        if (statusFilter !== 'All') {
          const s = statusFor(r);
          if (statusFilter === 'In Stock' && s !== 'ok') return false;
          if (statusFilter === 'Low' && s !== 'low') return false;
          if (statusFilter === 'Out' && s !== 'out') return false;
        }
        if (!q) return true;
        return r.name.toLowerCase().includes(q) || r.barcode.includes(q) || (r.category ?? '').toLowerCase().includes(q);
      })
      .slice(0, 30);
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
      const picks = allocation
        .filter((l) => l.take > 0)
        .map((l) => ({ expiry_date: l.expiry, qty: l.take }));
      await enqueue('dispense', {
        id: `dsp_${nanoid(12)}`,
        barcode: selected.barcode,
        product_name: selected.name,
        qty: totalTaken,
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
      await flushOnce().catch(() => {});
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
            options={STATUS_OPTIONS}
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
                    {item.on_hand}
                  </Text>
                </View>
              </Card>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text variant="bodyLarge" color={palette.onSurfaceVariant} style={{ textAlign: 'center' }}>
                  No items match.
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
          {(verifyStatus === 'offline' || verifyStatus === 'error' || verifyStatus === 'absent') && (
            <View
              style={[
                styles.statusBanner,
                { borderColor: palette.error, backgroundColor: palette.errorContainer ?? 'transparent' },
              ]}
            >
              <Text variant="bodyMedium" color={palette.error}>
                {t('couldntVerify')}
              </Text>
            </View>
          )}

          <Card tone="elevated" padding="xl">
            <Text variant="labelLarge" color={palette.onSurfaceVariant}>
              PRODUCT
            </Text>
            <Text variant="headlineSmall" style={{ marginTop: spacing.xs }}>
              {selected.name}
            </Text>
            <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.xs }}>
              {/* Show the verified on_hand once JIT resolves; fall back
                  to the local cache value until then. For divisible
                  products the on_hand IS the base unit — just append
                  unit. For pack-mode products keep the "N × packSize"
                  form. */}
              {verifiedOnHand ?? selected.on_hand}
              {selected.dispense_mode === 'divisible'
                ? selected.unit ? ` ${selected.unit}` : ''
                : `${selected.pack_size != null && selected.pack_size !== 1 ? ` × ${selected.pack_size}` : ''}${selected.unit ? ` ${selected.unit}` : ''}`}
              {' '}{t('onHand')}
            </Text>
          </Card>

          {/* Primary "How many?" stepper — the familiar input. Max is
              the verified total available across all lots so the user
              can't ask for more than exists. */}
          <View style={styles.qtySection}>
            <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ textAlign: 'center' }}>
              {t('howMany').toUpperCase()}
            </Text>
            <QtyStepper
              value={qty}
              onChange={setQty}
              min={selected.dispense_mode === 'divisible' ? 0.001 : 1}
              max={(totalAvailable || verifiedOnHand || selected.on_hand) || undefined}
              decimal={selected.dispense_mode === 'divisible'}
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
              decimal={selected.dispense_mode === 'divisible'}
            />
          )}

          <View>
            <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ marginBottom: spacing.sm }}>
              {t('reason').toUpperCase()}
            </Text>
            <View style={styles.chipRow}>
              {REASONS.map((r) => (
                <Chip key={r} label={r} selected={r === reason} onPress={() => setReason(r)} />
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
          {/* Confirm is gated by verification — fail-closed per the
              cache-freshness plan. While verifying or after a failed
              verification, the user can adjust qty / reason but can't
              commit until they reach a verified state. */}
          <Button
            label={t('confirm')}
            onPress={submit}
            loading={saving}
            disabled={verifyStatus !== 'ok' || totalTaken <= 0}
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
