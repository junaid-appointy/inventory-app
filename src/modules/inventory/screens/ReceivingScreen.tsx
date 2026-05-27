import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AlertTriangle, Calendar, Check, ScanLine } from 'lucide-react-native';
import { nanoid } from 'nanoid/non-secure';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { adjustOnHand, findStock, upsertStock } from '../../../db/stock';
import { getSession } from '../../../auth/session';
import { useT } from '../../../i18n';
import { useTheme } from '../../../theme';
import { RootStackParamList } from '../../../navigation/types';
import { flushOnce } from '../../../sync/syncService';
import { haptic } from '../../../utils/haptics';
import { useOrderSession } from '../components/OrderSessionContext';
import { DatePickerModal } from '../components/DatePickerModal';

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
  const { barcode } = route.params;
  const orderSession = useOrderSession();
  const [product, setProduct] = useState<Product | null>(null);
  const [item, setItem] = useState<OrderItem | null>(null);
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);

  // Expiry date state — driven by native date picker
  const [expiryDateObj, setExpiryDateObj] = useState<Date | null>(null);
  const [noExpiry, setNoExpiry] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    (async () => {
      setProduct(await findProduct(barcode));
      setItem(await findOpenItemByBarcode(barcode));
    })();
  }, [barcode]);

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
    const id = `rcp_${nanoid(12)}`;
    await enqueue('receipt', {
      id,
      order_id: item?.order_id ?? null,
      order_item_id: item?.id ?? null,
      barcode,
      product_name: product?.name ?? 'Unknown',
      qty,
      expiry_date: expiryDate,
      flagged,
      scanned_at: Date.now(),
      performed_by: session?.guardId ?? null,
      performed_by_name: session?.guardName ?? null,
    });
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
        name: product?.name ?? 'Unknown',
        category: product?.category ?? null,
        unit: product?.unit ?? null,
        on_hand: qty,
        threshold: 0,
      });
    }

    flushOnce().catch(() => {});

    // Track expiry for future alerts
    if (expiryDate) {
      await trackExpiry({
        barcode,
        productName: product?.name ?? 'Unknown',
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
    orderSession.addItem({
      barcode,
      name: product?.name ?? 'Unknown',
      category: product?.category ?? null,
      unit: product?.unit ?? null,
      qty,
      expiryDate,
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
        items: [{ name: product?.name ?? 'Unknown', category: product?.category ?? null, qty }],
        totalItems: 1,
        totalQty: qty,
        productName: product?.name ?? 'Unknown',
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
        items: [{ name: product?.name ?? 'Unknown', category: product?.category ?? null, qty }],
        totalItems: 1,
        totalQty: qty,
        productName: product?.name ?? 'Unknown',
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
    <View style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar
        title={t('receiveItem')}
        onBack={() => navigation.popToTop()}
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

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card tone="elevated" padding="xl">
          <Text variant="labelLarge" color={palette.onSurfaceVariant}>
            {t('product').toUpperCase()}
          </Text>
          <Text variant="headlineSmall" style={{ marginTop: spacing.xs }}>
            {product?.name ?? t('unknownProduct')}
          </Text>
          <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.xs }}>
            {barcode}
          </Text>
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
            EXPIRY DATE
          </Text>
          {!noExpiry && (
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
              No expiry date
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

