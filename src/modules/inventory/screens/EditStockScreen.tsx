import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check } from 'lucide-react-native';
import { nanoid } from 'nanoid/non-secure';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  AppBar,
  Button,
  Card,
  spacing,
  Text,
} from '../../../design';
import { getSession } from '../../../auth/session';
import { correctStockLocal, findStock, getNearestExpiry, StockRow } from '../../../db/stock';
import { listLots, replaceLotsLocal } from '../../../db/lots';
import { enqueue } from '../../../db/outbox';
import { useT } from '../../../i18n';
import { useTheme } from '../../../theme';
import { RootStackParamList } from '../../../navigation/types';
import { api, ApiError } from '../../../sync/api';
import { flushOnce } from '../../../sync/syncService';
import { haptic } from '../../../utils/haptics';
import { useKeyboardHeight } from '../../../hooks/useKeyboardHeight';
import { BatchEditor, Batch } from '../components/BatchEditor';
import { formatOnHand, resolveUnit } from '../../../units';

type Props = NativeStackScreenProps<RootStackParamList, 'EditStock'>;

/** Earliest non-null ISO date out of a list of batches. */
function earliestExpiry(batches: Batch[]): string | null {
  const sorted = batches
    .map((b) => b.expiry)
    .filter((e): e is string => !!e)
    .sort();
  return sorted[0] ?? null;
}

/**
 * This screen records a STOCKTAKE: "I counted the shelf and there is
 * this much." A count is a fact about the physical world, so it always
 * applies — there is no state in which we ask the user to choose between
 * their count and a number the system remembers. If an admin's change
 * and this count both land, they apply in server-arrival order and the
 * later one wins, which is what a queue does.
 *
 * loading — first read still in flight; save disabled because there is
 *           nothing to save yet.
 * ready   — we have something on screen and the count can be recorded,
 *           online or off. The outbox reconciles it either way.
 *
 * Deliberately absent: a `conflict` state. See
 * Planning-docs/inventory_conflict_free_sync_design.md — a merge prompt
 * asks a non-power user a question they cannot answer, and it only
 * exists because someone wrote an absolute number. We keep the absolute
 * write (a count IS absolute) but stop treating a stale local number as
 * a competing opinion worth arbitrating.
 */
type VerifyStatus = 'loading' | 'ready';

export function EditStockScreen({ route, navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const kbHeight = useKeyboardHeight();
  const { barcode } = route.params;

  const [row, setRow] = useState<StockRow | null>(null);
  const [originalQty, setOriginalQty] = useState<number>(0);
  const [originalExpiry, setOriginalExpiry] = useState<string | null>(null);
  const [originalBatches, setOriginalBatches] = useState<Batch[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);

  const [saving, setSaving] = useState(false);

  // Freshness fetch. Not a gate — we pull the server's lot breakdown so
  // the guard starts from the best numbers we have, then get out of the
  // way. A failure here never blocks recording a count: the shelf does
  // not stop being countable because the network is down.
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>('loading');
  const [serverQty, setServerQty] = useState<number | null>(null);

  /**
   * Where the batch rows on screen came from. The local read and the JIT
   * fetch race each other, so both consult this instead of assuming an
   * order. 'remote' wins and is never downgraded — the server's lot
   * breakdown is the real one.
   */
  const seedSource = useRef<'none' | 'local' | 'remote'>('none');
  /** Set once the guard edits anything, so a late-arriving JIT response
   *  can't wipe what they just typed. */
  const userTouched = useRef(false);

  const applySeed = (
    seed: Batch[],
    source: 'local' | 'remote',
    qtyRef: number,
    expiryRef: string | null,
  ) => {
    seedSource.current = source;
    setOriginalBatches(seed);
    setBatches(seed);
    setOriginalQty(qtyRef);
    setOriginalExpiry(expiryRef);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await findStock(barcode);
      const exp = await getNearestExpiry(barcode);
      const lots = await listLots(barcode);
      if (cancelled) return;
      if (!r) return;
      setRow(r);
      setVerifyStatus((s) => (s === 'loading' ? 'ready' : s));
      if (seedSource.current === 'remote') return;
      // Seed batches from local lots. If lots are empty (legacy row from
      // before the lots migration, or a cache that hasn't pulled batches
      // yet), synthesise one batch carrying the entire on_hand at the
      // cached nearest_expiry. That synthetic row is a placeholder to
      // look at, NOT something to save — the JIT fetch below replaces it
      // with the server's real breakdown, and Save stays disabled until
      // the fetch settles.
      const seed: Batch[] = lots.length > 0
        ? lots.map((l) => ({ expiry: l.expiry_date, qty: Number(l.qty) }))
        : [{ expiry: exp, qty: r.on_hand || 1 }];
      // Conflict reference = the earliest expiry actually present in what
      // we opened with. Deriving it from the seed rather than reading the
      // denormalised nearest_expiry column keeps the two in step even if
      // the column lags the lots it summarises — a mismatch here shows up
      // as a permanent, unresolvable "Stock has changed" banner.
      applySeed(seed, 'local', r.on_hand, earliestExpiry(seed));
    })();
    return () => { cancelled = true; };
  }, [barcode]);

  // Fire the JIT fetch independently of the local read so neither
  // blocks the other. The 3 s timeout matches CatalogPickerScreen.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    (async () => {
      try {
        const remote = await api.fetch.stockOne(barcode);
        if (cancelled) return;
        const remoteQty = Number(remote.on_hand);
        const remoteExpiry = remote.nearest_expiry ?? null;
        setServerQty(remoteQty);

        // Take the server's lot breakdown over anything we guessed
        // locally. Correcting stock REPLACES the lots, so seeding from a
        // cache that had no batches meant saving "one lot, no expiry"
        // over the real dated ones — the correction silently wiped the
        // expiry for everyone. Only skip this if the guard already
        // started editing; their input outranks a late response.
        const remoteLots = (remote.lots ?? []).map((l) => ({
          expiry: l.expiry_date,
          qty: Number(l.qty),
        }));
        if (remoteLots.length > 0 && !userTouched.current) {
          applySeed(remoteLots, 'remote', remoteQty, remoteExpiry);
        }
      } catch (err) {
        if (cancelled) return;
        // 401 is handled centrally; clear navigates to Login.
        if (err instanceof ApiError && err.status === 401) return;
        // Everything else — 404, offline, timeout, 5xx — is survivable.
        // We fall back to the local view and still let the count through.
        // Blocking here would punish the guard for our connectivity.
      } finally {
        clearTimeout(t);
        if (!cancelled) setVerifyStatus('ready');
      }
    })();
    return () => { cancelled = true; clearTimeout(t); controller.abort(); };
  }, [barcode]);

  /** Total qty across all batches — replaces the old single qty stepper. */
  const qty = useMemo(() => batches.reduce((s, b) => s + (b.qty || 0), 0), [batches]);

  /** Whatever ends up as the locally-tracked "nearest" expiry. */
  const localNearestExpiry = useMemo(() => earliestExpiry(batches), [batches]);

  /** True iff batches differ from what was loaded — qty or per-batch
   *  expiry. Counts re-orderings as no change. */
  const changed = useMemo(() => {
    if (!row) return false;
    const a = [...batches]
      .map((b) => `${b.expiry ?? ''}@${b.qty}`)
      .sort()
      .join('|');
    const b = [...originalBatches]
      .map((b) => `${b.expiry ?? ''}@${b.qty}`)
      .sort()
      .join('|');
    return a !== b;
  }, [row, batches, originalBatches]);
  /**
   * The system's number differs from what the guard is about to record.
   * This is a note, not a question — it exists so the guard can catch
   * their own typo, and it never blocks the save. If they counted 12 and
   * we thought 20, they are standing at the shelf and we are not.
   */
  const systemDiffers =
    serverQty !== null && Math.abs(serverQty - qty) > 1e-6 && userTouched.current;

  const submit = async () => {
    if (!row || !changed) return;
    const session = getSession();
    setSaving(true);
    try {
      // Coerce tri-state expiry (undefined = unset) → null for persistence.
      const cleanBatches = batches
        .filter((b) => b.qty > 0)
        .map((b) => ({ ...b, expiry: b.expiry ?? null }));
      // Optimistic local writes: stock cache + lots mirror.
      await correctStockLocal(barcode, qty, localNearestExpiry);
      await replaceLotsLocal(
        barcode,
        cleanBatches.map((b) => ({ expiry_date: b.expiry, qty: b.qty })),
      );
      await enqueue('stock_correction', {
        id: `crn_${nanoid(12)}`,
        barcode,
        product_name: row.name,
        old_qty: originalQty,
        new_qty: qty,
        old_expiry: originalExpiry,
        // New canonical shape: per-batch breakdown. Server's correction
        // route prefers `lots` over the legacy `new_expiry` /
        // `new_expiries` fields.
        lots: cleanBatches.map((b) => ({ expiry_date: b.expiry, qty: b.qty })),
        // Legacy fields kept for backward compatibility with older
        // server builds and dashboard audit views.
        new_expiry: cleanBatches.length === 1 ? cleanBatches[0].expiry : localNearestExpiry,
        new_expiries: null,
        performed_by: session?.guardId ?? null,
        performed_by_name: session?.guardName ?? null,
        corrected_at: Date.now(),
        // When the shelf was actually counted. Today this equals
        // corrected_at, but stamping it makes the count a dated
        // observation rather than an edit — which is what lets the
        // server later decide that an older in-flight movement was
        // already included in this count.
        counted_at: Date.now(),
      });
      // Await the flush so the StockScreen's focus refresh sees the
      // server-acknowledged value, not stale read-back data. Without
      // this, the GET races the POST and replaceStockFromRemote
      // overwrites the local optimistic write.
      await flushOnce().catch(() => {});
      haptic.success();
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  if (!row) {
    return (
      <View style={[styles.safe, { backgroundColor: palette.background }]}>
        <AppBar title={t('editStock')} onBack={() => navigation.goBack()} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'height' : undefined}
      style={{ flex: 1 }}
    >
      <View style={[styles.safe, { backgroundColor: palette.background }]}>
        <AppBar title={t('editStock')} subtitle={t('editStockSub')} onBack={() => navigation.goBack()} />

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: spacing.xxxl + kbHeight }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Two states only. While the freshest numbers are still
              loading we say so; once loaded we may note that the system
              expected a different total. There is deliberately no
              banner that asks the guard to choose a number. */}
          {verifyStatus === 'loading' && (
            <View style={[styles.statusBanner, { borderColor: palette.outlineVariant }]}>
              <ActivityIndicator color={palette.primary} size="small" />
              <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginLeft: spacing.sm }}>
                {t('verifying')}
              </Text>
            </View>
          )}
          {systemDiffers && serverQty !== null && (
            <View
              style={[
                styles.statusBanner,
                {
                  borderColor: palette.outlineVariant,
                  backgroundColor: palette.surfaceContainerLow,
                },
              ]}
            >
              <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ flex: 1 }}>
                {t('systemShows', {
                  amount: formatOnHand(serverQty, row?.pack_size, row?.unit),
                })}
              </Text>
            </View>
          )}

          <Card tone="elevated" padding="xl">
            <Text variant="labelLarge" color={palette.onSurfaceVariant}>
              {t('product').toUpperCase()}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.xs, gap: spacing.md }}>
              <Text variant="headlineSmall" style={{ flex: 1 }}>{row.name}</Text>
            </View>
            <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.md }}>
              {t('currentCount')}: {formatOnHand(originalQty, row.pack_size, row.unit)}
            </Text>
          </Card>

          <BatchEditor
            batches={batches}
            onChange={(next) => {
              userTouched.current = true;
              setBatches(next);
            }}
            unit={row.unit ?? null}
            packSize={row.pack_size ?? null}
            decimal={resolveUnit(row.unit).nature === 'continuous'}
            // Corrections are counted in base units — the guard weighs
            // "347 g left", they don't estimate "0.694 of a 500 g tub".
            editInBaseUnits
          />
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: palette.surface, borderTopColor: palette.outlineVariant }]}>
          {/* The only reasons a count cannot be recorded are that we
              have not loaded the item yet, or nothing was changed. Being
              offline is NOT one of them — the count goes to the outbox
              and reconciles when the network returns. */}
          <Button
            label={changed ? t('recordCount') : t('noChanges')}
            onPress={submit}
            loading={saving}
            disabled={!changed || verifyStatus === 'loading'}
            size="lg"
            fullWidth
            leadingIcon={<Check size={22} color={palette.onPrimary} strokeWidth={2.4} />}
          />
          <Button
            label={t('cancel')}
            variant="text"
            onPress={() => navigation.goBack()}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.xl },
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
  },
});
