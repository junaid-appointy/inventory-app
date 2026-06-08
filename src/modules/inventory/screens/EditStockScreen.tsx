import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check } from 'lucide-react-native';
import { nanoid } from 'nanoid/non-secure';
import React, { useEffect, useMemo, useState } from 'react';
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

type Props = NativeStackScreenProps<RootStackParamList, 'EditStock'>;

function formatForDisplay(iso: string): string {
  try {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  } catch {
    return iso;
  }
}

/** Earliest non-null ISO date out of a list of batches. */
function earliestExpiry(batches: Batch[]): string | null {
  const sorted = batches
    .map((b) => b.expiry)
    .filter((e): e is string => !!e)
    .sort();
  return sorted[0] ?? null;
}

/**
 * verifying  — JIT fetch in flight; save disabled.
 * ok         — server agrees with what we opened the screen with.
 * absent     — server has no row for this barcode (treat as ok — local
 *              view is the only truth; the correction will create it).
 * conflict   — server's on_hand or nearest_expiry differs from local;
 *              show prompt before letting user save.
 * offline    — fetch failed because network down; save disabled.
 * error      — fetch failed otherwise; save disabled.
 */
type VerifyStatus = 'verifying' | 'ok' | 'absent' | 'conflict' | 'offline' | 'error';

function isOfflineError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Network request failed') ||
    msg.includes('TypeError: Network') ||
    msg.includes('Unable to resolve host') ||
    msg === 'JIT timeout'
  );
}

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

  // JIT verification — fetch the server's authoritative on_hand +
  // nearest_expiry the moment the screen opens, in parallel with the
  // local read. If the server differs, we surface a "Stock has changed"
  // prompt before letting the user save. If the fetch fails (timeout /
  // offline / 5xx), we block the save entirely — corrections must be
  // committed against verified state per the cache-freshness plan.
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>('verifying');
  const [serverQty, setServerQty] = useState<number | null>(null);
  const [serverExpiry, setServerExpiry] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await findStock(barcode);
      const exp = await getNearestExpiry(barcode);
      const lots = await listLots(barcode);
      if (cancelled) return;
      if (!r) return;
      setRow(r);
      setOriginalQty(r.on_hand);
      setOriginalExpiry(exp);
      // Seed batches from local lots. If lots are empty (legacy row from
      // before the lots migration, or fresh barcode), synthesise one
      // batch carrying the entire on_hand at the cached nearest_expiry.
      const seed: Batch[] = lots.length > 0
        ? lots.map((l) => ({ expiry: l.expiry_date, qty: Number(l.qty) }))
        : [{ expiry: exp, qty: r.on_hand || 1 }];
      setOriginalBatches(seed);
      setBatches(seed);
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
        setServerExpiry(remoteExpiry);
        setVerifyStatus('ok'); // narrowed to 'conflict' below once we know local values
      } catch (err) {
        if (cancelled) return;
        // 404 = no stock row on server; treat as authoritative "absent"
        // — the correction will create it. Same UX as a clean ok.
        if (err instanceof ApiError && err.status === 404) {
          setVerifyStatus('absent');
          return;
        }
        // 401 is handled centrally; clear navigates to Login.
        if (err instanceof ApiError && err.status === 401) return;
        setVerifyStatus(isOfflineError(err) ? 'offline' : 'error');
      } finally {
        clearTimeout(t);
      }
    })();
    return () => { cancelled = true; clearTimeout(t); controller.abort(); };
  }, [barcode]);

  // Once both local and server have settled, classify ok-vs-conflict.
  // Conflict iff server differs from what the user is about to edit.
  // We use originalQty/originalExpiry as the "what the user opened
  // with" reference — those don't change unless the user explicitly
  // accepts the new server values.
  useEffect(() => {
    if (verifyStatus !== 'ok' || row === null || serverQty === null) return;
    const qtyDiffers = Math.abs(serverQty - originalQty) > 1e-9;
    const expiryDiffers = (serverExpiry ?? null) !== (originalExpiry ?? null);
    if (qtyDiffers || expiryDiffers) setVerifyStatus('conflict');
  }, [verifyStatus, row, serverQty, serverExpiry, originalQty, originalExpiry]);

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

  const packDisplay = row && row.pack_size != null && row.pack_size !== 1 && row.unit
    ? `${row.pack_size} ${row.unit}`
    : row?.unit ?? null;

  // When pack_size > 1 the count is in packs, not in the base unit —
  // " 1 g" is wrong for a 200 g pack. Drop the unit suffix in that case
  // (the pack hint at the top already shows "200 g").
  const countSuffix = row && row.pack_size != null && row.pack_size !== 1
    ? ''
    : row?.unit
      ? ` ${row.unit}`
      : '';

  /**
   * User accepted the server's view. Rebase originalQty / originalExpiry
   * and also replace what's in the steppers / date picker so the
   * "current count" line and the inputs match. The audit record's
   * old_qty / old_expiry will now reflect the actual transition.
   */
  const acceptServerView = () => {
    if (serverQty === null) return;
    haptic.tap();
    setOriginalQty(serverQty);
    setOriginalExpiry(serverExpiry ?? null);
    // We don't have the server's per-batch breakdown in the conflict
    // banner state — collapse into a single batch carrying the
    // server's nearest expiry. The guard can split it again after.
    const seed: Batch[] = [{ expiry: serverExpiry ?? null, qty: serverQty }];
    setOriginalBatches(seed);
    setBatches(seed);
    setVerifyStatus('ok');
  };

  /**
   * User chose to keep their edit. We still rebase originalQty /
   * originalExpiry to the SERVER's truth so the audit record reflects
   * "server was N, guard set it to M" — not "guard thought it was N
   * (stale), set it to M". Steppers untouched.
   */
  const keepUserEdit = () => {
    if (serverQty === null) return;
    haptic.tap();
    setOriginalQty(serverQty);
    setOriginalExpiry(serverExpiry ?? null);
    setVerifyStatus('ok');
  };

  const submit = async () => {
    if (!row || !changed) return;
    const session = getSession();
    setSaving(true);
    try {
      const cleanBatches = batches.filter((b) => b.qty > 0);
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
          {/* JIT verification status banners.
              - verifying: tiny inline indicator at top
              - conflict: amber banner with "Use new count" / "Keep my edit"
              - offline/error: red banner, save disabled, can retry */}
          {verifyStatus === 'verifying' && (
            <View style={[styles.statusBanner, { borderColor: palette.outlineVariant }]}>
              <ActivityIndicator color={palette.primary} size="small" />
              <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginLeft: spacing.sm }}>
                {t('verifying')}
              </Text>
            </View>
          )}
          {verifyStatus === 'conflict' && serverQty !== null && (
            <View
              style={[
                styles.statusBanner,
                {
                  borderColor: '#F9A825',
                  backgroundColor: 'rgba(249, 168, 37, 0.10)',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: spacing.sm,
                },
              ]}
            >
              <Text variant="titleMedium" color={palette.onSurface}>
                {t('stockUpdatedTitle')}
              </Text>
              <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
                {t('stockUpdatedBody')}
              </Text>
              <Text variant="bodyMedium" color={palette.onSurface}>
                {originalQty} → {serverQty}{countSuffix}
                {serverExpiry && serverExpiry !== originalExpiry
                  ? ` · ${formatForDisplay(serverExpiry)}`
                  : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button label={t('useNewCount')} variant="filled" size="md" onPress={acceptServerView} />
                <Button label={t('keepMyEdit')} variant="tonal" size="md" onPress={keepUserEdit} />
              </View>
            </View>
          )}
          {(verifyStatus === 'offline' || verifyStatus === 'error') && (
            <View
              style={[
                styles.statusBanner,
                { borderColor: palette.error, backgroundColor: palette.errorContainer ?? 'transparent' },
              ]}
            >
              <Text variant="bodyMedium" color={palette.error} style={{ flex: 1 }}>
                {t('couldntVerify')}
              </Text>
            </View>
          )}

          <Card tone="elevated" padding="xl">
            <Text variant="labelLarge" color={palette.onSurfaceVariant}>
              {t('product').toUpperCase()}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.xs, gap: spacing.md }}>
              <Text variant="headlineSmall" style={{ flex: 1 }}>{row.name}</Text>
              {packDisplay ? (
                <Text variant="titleMedium" color={palette.onSurfaceVariant}>{packDisplay}</Text>
              ) : null}
            </View>
            <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.md }}>
              {t('currentCount')}: {originalQty}{countSuffix}
            </Text>
          </Card>

          <BatchEditor
            batches={batches}
            onChange={setBatches}
            unit={row.unit ?? null}
          />
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: palette.surface, borderTopColor: palette.outlineVariant }]}>
          {/* Save is gated by verification: cannot commit a correction
              while we're still verifying, in conflict (user must
              resolve via the banner), or while verification failed
              (offline / error — user retries by going back and re-
              opening once network returns). */}
          <Button
            label={changed ? t('saveChanges') : t('noChanges')}
            onPress={submit}
            loading={saving}
            disabled={
              !changed ||
              verifyStatus === 'verifying' ||
              verifyStatus === 'conflict' ||
              verifyStatus === 'offline' ||
              verifyStatus === 'error'
            }
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
