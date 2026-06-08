import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Calendar, Check } from 'lucide-react-native';
import { nanoid } from 'nanoid/non-secure';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  AppBar,
  Button,
  Card,
  QtyStepper,
  radius,
  spacing,
  Text,
} from '../../../design';
import { getSession } from '../../../auth/session';
import { correctStockLocal, findStock, getNearestExpiry, StockRow } from '../../../db/stock';
import { enqueue } from '../../../db/outbox';
import { useT } from '../../../i18n';
import { useTheme } from '../../../theme';
import { RootStackParamList } from '../../../navigation/types';
import { api, ApiError } from '../../../sync/api';
import { flushOnce } from '../../../sync/syncService';
import { haptic } from '../../../utils/haptics';
import { DatePickerModal } from '../components/DatePickerModal';
import { useKeyboardHeight } from '../../../hooks/useKeyboardHeight';

type Props = NativeStackScreenProps<RootStackParamList, 'EditStock'>;

function formatForDisplay(iso: string): string {
  try {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  } catch {
    return iso;
  }
}

function toISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Earliest date out of a list; nulls ignored. Returns null if all null. */
function earliestISO(dates: (Date | null)[]): string | null {
  const isos = dates.filter((d): d is Date => !!d).map(toISO).sort();
  return isos[0] ?? null;
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
  const [qty, setQty] = useState<number>(0);
  const [expiryDateObj, setExpiryDateObj] = useState<Date | null>(null);
  const [noExpiry, setNoExpiry] = useState<boolean>(false);

  // Per-pack expiry. Mirrors ReceivingScreen: off by default; appears only
  // when qty > 1 and not noExpiry. When on, expand into N rows so the
  // guard can set a different expiry on each pack.
  const [perPackExpiry, setPerPackExpiry] = useState(false);
  const [perPackExpiries, setPerPackExpiries] = useState<(Date | null)[]>([]);
  const [editingPackIdx, setEditingPackIdx] = useState<number | null>(null);

  const [showPicker, setShowPicker] = useState(false);
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
      if (cancelled) return;
      if (!r) return;
      setRow(r);
      setOriginalQty(r.on_hand);
      setOriginalExpiry(exp);
      setQty(r.on_hand);
      if (exp) {
        setExpiryDateObj(new Date(exp));
        setNoExpiry(false);
      } else {
        setNoExpiry(true);
      }
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

  // Keep the per-pack list in sync with qty when toggle is on. Seed new
  // rows with the bulk expiry so the guard only edits the differing ones.
  useEffect(() => {
    if (!perPackExpiry) return;
    setPerPackExpiries((prev) => {
      const n = Math.max(1, Math.floor(qty));
      if (prev.length === n) return prev;
      const next = [...prev];
      while (next.length < n) next.push(expiryDateObj);
      while (next.length > n) next.pop();
      return next;
    });
  }, [perPackExpiry, qty, expiryDateObj]);

  // Auto-disable per-pack when the toggle's preconditions go away
  // (qty drops to 1, or guard checks "no expiry").
  useEffect(() => {
    if (perPackExpiry && (qty <= 1 || noExpiry)) {
      setPerPackExpiry(false);
    }
  }, [perPackExpiry, qty, noExpiry]);

  /** Single new_expiry sent to server when per-pack is off. */
  const newSingleExpiry = useMemo(() => {
    if (noExpiry || perPackExpiry || !expiryDateObj) return null;
    return toISO(expiryDateObj);
  }, [expiryDateObj, noExpiry, perPackExpiry]);

  /** Array of expiries sent when per-pack is on. */
  const newExpiriesArray = useMemo<string[] | null>(() => {
    if (noExpiry || !perPackExpiry) return null;
    return perPackExpiries.map((d) => (d ? toISO(d) : '')).filter((s) => s.length > 0);
  }, [noExpiry, perPackExpiry, perPackExpiries]);

  /** Whatever ends up as the locally-tracked "nearest" expiry. */
  const localNearestExpiry = useMemo(() => {
    if (noExpiry) return null;
    if (perPackExpiry) return earliestISO(perPackExpiries);
    return expiryDateObj ? toISO(expiryDateObj) : null;
  }, [noExpiry, perPackExpiry, perPackExpiries, expiryDateObj]);

  const changed = useMemo(() => {
    if (!row) return false;
    if (qty !== originalQty) return true;
    if (localNearestExpiry !== originalExpiry) return true;
    // Per-pack with same nearest as original still counts as a change if
    // any pack carries a date different from the bulk default.
    if (perPackExpiry) return true;
    return false;
  }, [row, qty, originalQty, localNearestExpiry, originalExpiry, perPackExpiry]);

  const packDisplay = row && row.pack_size != null && row.pack_size !== 1 && row.unit
    ? `${row.pack_size} ${row.unit}`
    : row?.unit ?? null;

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
    setQty(serverQty);
    setOriginalExpiry(serverExpiry ?? null);
    if (serverExpiry) {
      setExpiryDateObj(new Date(serverExpiry));
      setNoExpiry(false);
    } else {
      setExpiryDateObj(null);
      setNoExpiry(true);
    }
    setPerPackExpiry(false);
    setPerPackExpiries([]);
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
      await correctStockLocal(barcode, qty, localNearestExpiry);
      await enqueue('stock_correction', {
        id: `crn_${nanoid(12)}`,
        barcode,
        product_name: row.name,
        old_qty: originalQty,
        new_qty: qty,
        old_expiry: originalExpiry,
        new_expiry: newSingleExpiry,
        new_expiries: newExpiriesArray,
        performed_by: session?.guardId ?? null,
        performed_by_name: session?.guardName ?? null,
        corrected_at: Date.now(),
      });
      flushOnce().catch(() => {});
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
                {originalQty} → {serverQty}
                {row.unit ? ` ${row.unit}` : ''}
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
              {t('currentCount')}: {originalQty}{row.unit ? ` ${row.unit}` : ''}
            </Text>
          </Card>

          <View style={styles.qtySection}>
            <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ textAlign: 'center' }}>
              {t('newCount').toUpperCase()}
            </Text>
            <QtyStepper value={qty} onChange={setQty} min={0} />
          </View>

          <View style={styles.expirySection}>
            <Text variant="labelLarge" color={palette.onSurfaceVariant}>
              {t('expiryDate').toUpperCase()}
            </Text>

            {/* Per-pack toggle. Mirrors ReceivingScreen: only useful for
                multi-qty edits. */}
            {qty > 1 && !noExpiry && (
              <Pressable
                onPress={() => { setPerPackExpiry((v) => !v); haptic.tap(); }}
                style={[styles.noExpiryRow, { marginTop: spacing.sm }]}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      backgroundColor: perPackExpiry ? palette.primary : 'transparent',
                      borderColor: perPackExpiry ? palette.primary : palette.outline,
                    },
                  ]}
                >
                  {perPackExpiry && <Check size={14} color={palette.onPrimary} strokeWidth={3} />}
                </View>
                <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
                  {t('perPackExpiry')} ({Math.floor(qty)} {t('packsLabel')})
                </Text>
              </Pressable>
            )}

            {!noExpiry && !perPackExpiry && (
              <>
                <Pressable
                  onPress={() => setShowPicker(true)}
                  style={[
                    styles.expiryInput,
                    {
                      backgroundColor: palette.surfaceContainerLowest,
                      borderColor: palette.outlineVariant,
                      flexDirection: 'row',
                      alignItems: 'center',
                    },
                  ]}
                >
                  <Calendar size={20} color={palette.onSurfaceVariant} strokeWidth={2} />
                  <Text
                    variant="bodyLarge"
                    color={expiryDateObj ? palette.onSurface : palette.onSurfaceVariant}
                    style={{ marginLeft: spacing.sm, flex: 1, letterSpacing: 1 }}
                  >
                    {expiryDateObj ? formatForDisplay(toISO(expiryDateObj)) : t('tapToSelectDate')}
                  </Text>
                </Pressable>
                {showPicker && editingPackIdx == null && (
                  <DatePickerModal
                    visible={showPicker}
                    value={expiryDateObj}
                    onSelect={(d) => { setExpiryDateObj(d); setNoExpiry(false); }}
                    onDismiss={() => setShowPicker(false)}
                  />
                )}
              </>
            )}

            {!noExpiry && perPackExpiry && (
              <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
                {perPackExpiries.map((d, i) => (
                  <Pressable
                    key={i}
                    onPress={() => { setEditingPackIdx(i); setShowPicker(true); }}
                    style={[
                      styles.expiryInput,
                      {
                        backgroundColor: palette.surfaceContainerLowest,
                        borderColor: palette.outlineVariant,
                        flexDirection: 'row',
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <Text variant="labelMedium" color={palette.onSurfaceVariant} style={{ marginRight: spacing.sm, minWidth: 56 }}>
                      {t('pack')} {i + 1}
                    </Text>
                    <Calendar size={18} color={palette.onSurfaceVariant} strokeWidth={2} />
                    <Text
                      variant="bodyLarge"
                      color={d ? palette.onSurface : palette.onSurfaceVariant}
                      style={{ marginLeft: spacing.sm, flex: 1, letterSpacing: 1 }}
                    >
                      {d ? formatForDisplay(toISO(d)) : t('tapToSelectDate')}
                    </Text>
                  </Pressable>
                ))}
                {showPicker && editingPackIdx != null && (
                  <DatePickerModal
                    visible={showPicker}
                    value={perPackExpiries[editingPackIdx]}
                    onSelect={(date) => {
                      setPerPackExpiries((prev) => prev.map((p, i) => (i === editingPackIdx ? date : p)));
                    }}
                    onDismiss={() => { setShowPicker(false); setEditingPackIdx(null); }}
                  />
                )}
              </View>
            )}

            <Pressable
              onPress={() => { setNoExpiry(!noExpiry); haptic.tap(); }}
              style={styles.noExpiryRow}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    backgroundColor: noExpiry ? palette.primary : 'transparent',
                    borderColor: noExpiry ? palette.primary : palette.outline,
                  },
                ]}
              >
                {noExpiry && <Check size={14} color={palette.onPrimary} strokeWidth={3} />}
              </View>
              <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
                {t('noExpiry')}
              </Text>
            </Pressable>
          </View>
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
  qtySection: { gap: spacing.lg, alignItems: 'stretch' },
  expirySection: { gap: spacing.sm },
  expiryInput: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    fontSize: 18,
    letterSpacing: 2,
  },
  noExpiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
