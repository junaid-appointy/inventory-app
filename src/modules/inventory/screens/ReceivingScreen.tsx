import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AlertTriangle, Calendar, Check, ScanLine } from 'lucide-react-native';
import { nanoid } from 'nanoid/non-secure';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, KeyboardAvoidingView } from 'react-native';
import {
  AppBar,
  Button,
  Card,
  Chip,
  IconButton,
  QtyStepper,
  radius,
  spacing,
  StatusPill,
  Text,
} from '../../../design';
import { addReceivedQty, findOpenItemByBarcode, OrderItem } from '../../../db/orders';
import { enqueue } from '../../../db/outbox';
import { trackExpiry } from '../../../db/expiry';
import { findProduct, Product } from '../../../db/products';
import { learnBarcode, findOpenItemByProductId } from '../../../db/catalog';
import { adjustOnHand, findStock, upsertStock } from '../../../db/stock';
import { getSession } from '../../../auth/session';
import { useT } from '../../../i18n';
import { useTheme } from '../../../theme';
import { RootStackParamList } from '../../../navigation/types';
import { flushOnce } from '../../../sync/syncService';
import { haptic } from '../../../utils/haptics';
import { useOrderSession } from '../components/OrderSessionContext';
import { DatePickerModal } from '../components/DatePickerModal';
import { useKeyboardHeight } from '../../../hooks/useKeyboardHeight';

type Props = NativeStackScreenProps<RootStackParamList, 'Receiving'>;

/** Format ISO date to DD/MM/YYYY for display */
function formatForDisplay(iso: string): string {
  try {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  } catch {
    return iso;
  }
}

/** Convert Date object to ISO date string */
function toISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

const QUICK_MONTHS = [
  { label: '3 mo', months: 3 },
  { label: '6 mo', months: 6 },
  { label: '1 yr', months: 12 },
  { label: '2 yr', months: 24 },
];

export function ReceivingScreen({ route, navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const kbHeight = useKeyboardHeight();
  const { barcode, productId, productName: paramProductName, unit: paramUnit, packSize: paramPackSize } = route.params;
  const orderSession = useOrderSession();
  const [product, setProduct] = useState<Product | null>(null);
  const [item, setItem] = useState<OrderItem | null>(null);
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);

  // Expiry date state — driven by native date picker
  const [expiryDateObj, setExpiryDateObj] = useState<Date | null>(null);
  const [noExpiry, setNoExpiry] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  // Per-pack expiry. Default OFF — most bulk scans share one batch /
  // one expiry. When ON, expand a list of N rows so the guard can set
  // a different expiry on each pack of the multi-quantity scan.
  const [perPackExpiry, setPerPackExpiry] = useState(false);
  const [perPackExpiries, setPerPackExpiries] = useState<(Date | null)[]>([]);
  const [editingPackIdx, setEditingPackIdx] = useState<number | null>(null);

  // Keep the per-pack list in lockstep with qty when the toggle is on.
  // Initialise new rows with the bulk expiry so the guard can edit
  // only the ones that actually differ.
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

  // Resolved product name: canonical name takes priority over legacy product name
  const resolvedName = paramProductName ?? product?.name ?? 'Unknown';
  const resolvedUnit = paramUnit ?? product?.unit ?? null;
  const resolvedPackSize = paramPackSize ?? null;
  const packDisplay =
    resolvedPackSize != null && resolvedUnit
      ? `${resolvedPackSize} ${resolvedUnit}`
      : resolvedUnit ?? null;

  useEffect(() => {
    (async () => {
      setProduct(await findProduct(barcode));
      // If we have a productId from catalog, look up order item by product_id
      if (productId) {
        const byProduct = await findOpenItemByProductId(productId);
        setItem(byProduct as OrderItem | null);
      } else {
        setItem(await findOpenItemByBarcode(barcode));
      }
    })();
  }, [barcode, productId]);

  // Auto-fill expiry from last scanned item in the order session
  useEffect(() => {
    if (orderSession.lastExpiry && !noExpiry && !expiryDateObj) {
      setExpiryDateObj(new Date(orderSession.lastExpiry));
    }
  }, [orderSession.lastExpiry, noExpiry, expiryDateObj]);

  const setExact = (n: number) => {
    haptic.tap();
    setQty(n);
  };

  const expiryDate = useMemo(() => {
    if (noExpiry || !expiryDateObj) return null;
    return toISO(expiryDateObj);
  }, [expiryDateObj, noExpiry]);

  const handleQuickMonth = (months: number) => {
    haptic.tap();
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    setExpiryDateObj(d);
    setNoExpiry(false);
  };

  const handlePickerChange = (date: Date) => {
    setExpiryDateObj(date);
    setNoExpiry(false);
  };

  /** Standalone receipt path — when no order session is active */
  const persistStandalone = async (flagged: boolean) => {
    const session = getSession();
    // Per-pack expiry: split into N qty=1 receipts so each pack carries
    // its own expiry date. Single-expiry path stays as one bulk row.
    const receipts: Array<{ id: string; qty: number; expiry: string | null }> = perPackExpiry
      ? perPackExpiries.map((d) => ({
          id: `rcp_${nanoid(12)}`,
          qty: 1,
          expiry: d ? toISO(d) : null,
        }))
      : [{ id: `rcp_${nanoid(12)}`, qty, expiry: expiryDate }];

    // The first receipt's id is what we use to link mismatch flags etc.
    const id = receipts[0].id;

    for (const r of receipts) {
      await enqueue('receipt', {
        id: r.id,
        order_id: item?.order_id ?? null,
        order_item_id: item?.id ?? null,
        product_id: productId ?? null,
        barcode,
        product_name: resolvedName,
        qty: r.qty,
        expiry_date: r.expiry,
        flagged,
        scanned_at: Date.now(),
        performed_by: session?.guardId ?? null,
        performed_by_name: session?.guardName ?? null,
      });
    }

    // Barcode learning: if this receipt was resolved via canonical catalog,
    // permanently map this barcode to the product_id for auto-resolution.
    if (productId && !barcode.startsWith('catalog_')) {
      await learnBarcode(barcode, productId, 'scan');
      // Also tell the backend to learn it
      await enqueue('learn_barcode', {
        barcode,
        product_id: productId,
      }).catch(() => {});
    }
    if (flagged) {
      await enqueue('mismatch_flag', {
        id: `flg_${nanoid(12)}`,
        receipt_id: id,
        order_item_id: item?.id ?? null,
        barcode,
        expected: item?.expected_qty ?? null,
        received_total: (item?.received_qty ?? 0) + qty,
        flagged_at: Date.now(),
      });
    }
    if (item) await addReceivedQty(item.id, qty);

    const existing = await findStock(barcode);
    if (existing) {
      await adjustOnHand(barcode, qty);
    } else {
      await upsertStock({
        barcode,
        name: resolvedName,
        category: product?.category ?? null,
        unit: resolvedUnit,
        pack_size: resolvedPackSize,
        on_hand: qty,
        threshold: 0,
      });
    }

    flushOnce().catch(() => {});

    // Track expiry for future alerts
    if (expiryDate) {
      await trackExpiry({
        barcode,
        productName: resolvedName,
        expiryDate,
        qty,
        receiptId: id,
        performedBy: session?.guardId ?? null,
        performedByName: session?.guardName ?? null,
      });
    }
  };

  /** Add to order session */
  const addToSession = () => {
    // Per-pack expiry → N qty=1 batches each with its own date.
    // Single-expiry → one batch with the full qty.
    const batches = perPackExpiry
      ? perPackExpiries.map((d) => ({ qty: 1, expiry: d ? toISO(d) : null }))
      : [{ qty, expiry: expiryDate }];
    const totalQty = batches.reduce((s, b) => s + b.qty, 0);

    orderSession.addItem({
      barcode,
      productId: productId ?? null,
      name: resolvedName,
      category: product?.category ?? null,
      unit: resolvedUnit,
      packSize: resolvedPackSize,
      qty: totalQty,
      batches,
    });
    haptic.success();
    navigation.navigate('OrderSession');
  };

  /** Standalone confirm (no active order session) */
  const confirmStandalone = async () => {
    setSaving(true);
    try {
      await persistStandalone(false);
      haptic.success();
      navigation.replace('DeliverySummary', {
        items: [{ name: resolvedName, category: product?.category ?? null, qty }],
        totalItems: 1,
        totalQty: qty,
        productName: resolvedName,
        qty,
        expected: item?.expected_qty ?? null,
        flagged: false,
      });
    } finally {
      setSaving(false);
    }
  };

  const flagAndContinueStandalone = async () => {
    setSaving(true);
    try {
      await persistStandalone(true);
      haptic.warn();
      navigation.replace('DeliverySummary', {
        items: [{ name: resolvedName, category: product?.category ?? null, qty }],
        totalItems: 1,
        totalQty: qty,
        productName: resolvedName,
        qty,
        expected: item?.expected_qty ?? null,
        flagged: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const expected = item?.expected_qty ?? null;
  const alreadyIn = item?.received_qty ?? 0;
  const projected = alreadyIn + qty;
  const mismatch = expected !== null && projected > expected;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'height' : undefined}
      style={{ flex: 1 }}
    >
      <View style={[styles.safe, { backgroundColor: palette.background }]}>
        <AppBar
          title={t('receiveItem')}
          onBack={() => navigation.goBack()}
          trailing={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              {expected !== null ? (
                <StatusPill
                  label={`${projected} / ${expected}`}
                  tone={mismatch ? 'danger' : projected === expected ? 'success' : 'neutral'}
                />
              ) : null}
              <IconButton Icon={ScanLine} onPress={() => navigation.replace('Scanner')} />
            </View>
          }
        />

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: spacing.xxxl + kbHeight }]}
          keyboardShouldPersistTaps="handled"
        >
        <Card tone="elevated" padding="xl">
          <Text variant="labelLarge" color={palette.onSurfaceVariant}>
            {t('product').toUpperCase()}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.xs, gap: spacing.md }}>
            <Text variant="headlineSmall" style={{ flex: 1 }}>
              {resolvedName}
            </Text>
            {packDisplay ? (
              <Text variant="titleMedium" color={palette.onSurfaceVariant}>
                {packDisplay}
              </Text>
            ) : null}
          </View>
          {/* Barcode chip. For real (scanned or already-learned) barcodes
              we surface the code so guards can confirm at a glance. For
              an unmapped catalog pick we don't dump the synthetic
              `catalog_<product_id>` id — it's meaningless to the user.
              We just label the row "No barcode yet" so it's obvious why
              there's nothing to read. */}
          {barcode.startsWith('catalog_') ? (
            <View
              style={{
                marginTop: spacing.sm,
                alignSelf: 'flex-start',
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: palette.outlineVariant,
                backgroundColor: palette.surfaceContainerLowest,
              }}
            >
              <Text variant="labelMedium" color={palette.onSurfaceVariant}>
                {t('noBarcodeYet')}
              </Text>
            </View>
          ) : (
            <View
              style={{
                marginTop: spacing.sm,
                alignSelf: 'flex-start',
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: palette.outlineVariant,
                backgroundColor: palette.surfaceContainerLowest,
              }}
            >
              <Text
                variant="titleMedium"
                color={palette.onSurface}
                style={{
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  letterSpacing: 1.5,
                }}
              >
                {barcode}
              </Text>
            </View>
          )}
          {expected !== null ? (
            <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.md }}>
              {t('expectedShort')} {expected} · {alreadyIn} {t('alreadyReceived')}
            </Text>
          ) : (
            <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.md }}>
              {t('noMatchingOrder')}
            </Text>
          )}
        </Card>

        <View style={styles.qtySection}>
          <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ textAlign: 'center' }}>
            {t('quantityReceived').toUpperCase()}
          </Text>
          <QtyStepper value={qty} onChange={setQty} min={1} />
          <View style={styles.quickRow}>
            {[5, 10, 20, 50].map((n) => (
              <QuickChip key={n} value={n} active={qty === n} onPress={() => setExact(n)} />
            ))}
          </View>
          {mismatch ? (
            <View style={{ alignItems: 'center', marginTop: spacing.md }}>
              <StatusPill
                label={`Over by ${projected - expected!}`}
                tone="danger"
                Icon={AlertTriangle}
              />
            </View>
          ) : null}
        </View>

        {/* Expiry Date Section */}
        <View style={styles.expirySection}>
          <Text variant="labelLarge" color={palette.onSurfaceVariant}>
            {t('expiryDate').toUpperCase()}
          </Text>

          {/* Per-pack toggle. Only useful for multi-quantity scans. */}
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
              {showPicker && (
                <DatePickerModal
                  visible={showPicker}
                  value={expiryDateObj}
                  minimumDate={new Date()}
                  onSelect={handlePickerChange}
                  onDismiss={() => setShowPicker(false)}
                />
              )}
              <View style={styles.quickRow}>
                {QUICK_MONTHS.map((q) => (
                  <Pressable
                    key={q.label}
                    onPress={() => handleQuickMonth(q.months)}
                    android_ripple={{ color: palette.outlineVariant }}
                    style={[styles.monthChip, { backgroundColor: palette.surfaceContainerLow, borderColor: palette.outlineVariant }]}
                  >
                    <Text variant="labelLarge" color={palette.onSurface}>
                      {q.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
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
                  minimumDate={new Date()}
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
          {/* Primary action: add to order session */}
          <Button
            label={t('addToOrder')}
            onPress={addToSession}
            loading={saving}
            size="lg"
            fullWidth
            leadingIcon={<Check size={22} color={palette.onPrimary} strokeWidth={2.4} />}
          />
          {/* Secondary: standalone receipt (when not in a multi-scan flow) */}
          {!orderSession.isActive && mismatch && (
            <Button
              label={t('flagAndContinue')}
              onPress={flagAndContinueStandalone}
              variant="danger"
              loading={saving}
              size="md"
              fullWidth
              style={{ marginTop: spacing.sm }}
            />
          )}
          <Button
            label={t('cancel')}
            variant="text"
            onPress={() => navigation.popToTop()}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function QuickChip({ value, active, onPress }: { value: number; active: boolean; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: palette.outlineVariant }}
      style={[
        styles.quickChip,
        {
          backgroundColor: active ? palette.secondaryContainer : palette.surfaceContainerLow,
          borderColor: active ? palette.secondaryContainer : palette.outlineVariant,
        },
      ]}
    >
      <Text variant="titleMedium" color={active ? palette.onSecondaryContainer : palette.onSurface}>
        {value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl },
  qtySection: { gap: spacing.lg, alignItems: 'stretch' },
  quickRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  quickChip: {
    minWidth: 64,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    overflow: 'hidden',
  },
  expirySection: { gap: spacing.sm },
  expiryInput: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    fontSize: 18,
    letterSpacing: 2,
  },
  monthChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: 'hidden',
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
});

