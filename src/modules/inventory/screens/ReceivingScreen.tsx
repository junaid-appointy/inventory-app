import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AlertTriangle, Check, ScanLine } from 'lucide-react-native';
import { nanoid } from 'nanoid/non-secure';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View, KeyboardAvoidingView } from 'react-native';
import {
  AppBar,
  Button,
  Card,
  IconButton,
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
import { addLotLocal } from '../../../db/lots';
import { getSession } from '../../../auth/session';
import { useT } from '../../../i18n';
import { useTheme } from '../../../theme';
import { RootStackParamList } from '../../../navigation/types';
import { flushOnce } from '../../../sync/syncService';
import { haptic } from '../../../utils/haptics';
import { useOrderSession } from '../components/OrderSessionContext';
import { useKeyboardHeight } from '../../../hooks/useKeyboardHeight';
import { BatchEditor, Batch } from '../components/BatchEditor';

type Props = NativeStackScreenProps<RootStackParamList, 'Receiving'>;

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
  const [saving, setSaving] = useState(false);

  // One row per distinct expiry. Default to a single batch carrying
  // qty=1 — matches the 90% case of "one pack, one expiry". Guard taps
  // "+ Add another expiry batch" to break into groups.
  // ReceivingScreen always asks in packs (integer) even for divisible
  // products: physical intake is always whole packs. The translation to
  // base units (e.g. 3 packs × 5 kg → 15 kg lot qty) happens at submit.
  // Initial batch is "unset" (undefined) — forces the guard to actively
  // pick "Pick expiry" or "No expiry" rather than silently defaulting.
  const [batches, setBatches] = useState<Batch[]>([{ qty: 1, expiry: undefined }]);
  const qty = useMemo(() => batches.reduce((s, b) => s + (b.qty || 0), 0), [batches]);

  // Resolved product name: canonical name takes priority over legacy product name
  const resolvedName = paramProductName ?? product?.name ?? 'Unknown';
  const resolvedUnit = paramUnit ?? product?.unit ?? null;
  const resolvedPackSize = paramPackSize ?? null;
  const packDisplay =
    resolvedPackSize != null && resolvedUnit
      ? `${resolvedPackSize} ${resolvedUnit}`
      : resolvedUnit ?? null;

  const [dispenseMode, setDispenseMode] = useState<'pack' | 'divisible'>('pack');

  useEffect(() => {
    (async () => {
      setProduct(await findProduct(barcode));
      const stockRow = await findStock(barcode);
      if (stockRow?.dispense_mode === 'divisible') setDispenseMode('divisible');
      // If we have a productId from catalog, look up order item by product_id
      if (productId) {
        const byProduct = await findOpenItemByProductId(productId);
        setItem(byProduct as OrderItem | null);
      } else {
        setItem(await findOpenItemByBarcode(barcode));
      }
    })();
  }, [barcode, productId]);

  /** Convert a "packs received" integer into the units stored in lots:
   *  packs for pack-mode; packs × pack_size (base units) for divisible. */
  const toLotQty = (packsQty: number): number => {
    if (dispenseMode !== 'divisible') return packsQty;
    const ps = resolvedPackSize && resolvedPackSize > 0 ? resolvedPackSize : 1;
    return packsQty * ps;
  };

  // Auto-fill expiry on the (single) initial batch from the last scanned
  // item in this order session — matches "same expiry as the last pack
  // off the truck" behaviour.
  useEffect(() => {
    if (orderSession.lastExpiry && batches.length === 1 && batches[0].expiry === undefined) {
      setBatches([{ qty: batches[0].qty, expiry: orderSession.lastExpiry }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderSession.lastExpiry]);

  /** Standalone receipt path — when no order session is active */
  const persistStandalone = async (flagged: boolean) => {
    const session = getSession();
    // One receipt per distinct expiry batch. Each batch carries its
    // total qty (no exploding into N qty=1 rows).
    // Coerce the editor's tri-state (undefined = unset) into the binary
    // string|null the persistence layer expects. Unset at submit time
    // = same as "no expiry" — submit shouldn't block on an indecision.
    const cleanBatches = batches
      .filter((b) => b.qty > 0)
      .map((b) => ({ ...b, expiry: b.expiry ?? null }));
    // For divisible products, the lot is stored in base units (pack count
    // × pack_size). Pack-mode lots keep the raw count.
    const receipts: Array<{ id: string; qty: number; expiry: string | null }> =
      cleanBatches.map((b) => ({
        id: `rcp_${nanoid(12)}`,
        qty: toLotQty(b.qty),
        expiry: b.expiry,
      }));

    // The first receipt's id is what we use to link mismatch flags etc.
    const id = receipts[0]?.id ?? `rcp_${nanoid(12)}`;

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
      // Mirror the lot locally so EditStock / Dispense see the new
      // batch before the next sync round-trip.
      await addLotLocal(barcode, r.expiry, r.qty);
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
    // Order item received_qty and stock on_hand track the same lot units —
    // packs for pack-mode, base units for divisible. Mirror toLotQty.
    const totalLotQty = toLotQty(qty);
    if (item) await addReceivedQty(item.id, totalLotQty);

    const existing = await findStock(barcode);
    if (existing) {
      await adjustOnHand(barcode, totalLotQty);
    } else {
      await upsertStock({
        barcode,
        name: resolvedName,
        category: product?.category ?? null,
        unit: resolvedUnit,
        pack_size: resolvedPackSize,
        dispense_mode: dispenseMode,
        on_hand: totalLotQty,
        threshold: 0,
      });
    }

    flushOnce().catch(() => {});

    // Track expiry for future alerts — one entry per batch (qty in lot units).
    for (const b of cleanBatches) {
      if (!b.expiry) continue;
      await trackExpiry({
        barcode,
        productName: resolvedName,
        expiryDate: b.expiry,
        qty: toLotQty(b.qty),
        receiptId: id,
        performedBy: session?.guardId ?? null,
        performedByName: session?.guardName ?? null,
      });
    }
  };

  /** Add to order session */
  const addToSession = () => {
    const cleanBatches = batches.filter((b) => b.qty > 0);
    const totalQty = cleanBatches.reduce((s, b) => s + b.qty, 0);

    orderSession.addItem({
      barcode,
      productId: productId ?? null,
      name: resolvedName,
      category: product?.category ?? null,
      unit: resolvedUnit,
      packSize: resolvedPackSize,
      qty: totalQty,
      // Coerce tri-state expiry into the binary string|null the session
      // expects — submit shouldn't carry an indecision past this point.
      batches: cleanBatches.map((b) => ({ qty: b.qty, expiry: b.expiry ?? null })),
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

        <BatchEditor
          batches={batches}
          onChange={setBatches}
          minDate={new Date()}
          unit={resolvedUnit ?? null}
          packSize={resolvedPackSize ?? null}
          dispenseMode={dispenseMode}
        />

        {mismatch ? (
          <View style={{ alignItems: 'center' }}>
            <StatusPill
              label={`Over by ${projected - expected!}`}
              tone="danger"
              Icon={AlertTriangle}
            />
          </View>
        ) : null}
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

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
  },
});

