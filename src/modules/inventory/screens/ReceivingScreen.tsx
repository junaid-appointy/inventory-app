import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AlertTriangle, Camera, CalendarDays, CalendarOff, CalendarPlus, Check, X, type LucideIcon } from 'lucide-react-native';
import { nanoid } from 'nanoid/non-secure';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AmountStepper } from '../../../components/AmountStepper';
import { DateTile } from '../../../components/DateTile';
import { PackIcons } from '../../../components/PackIcons';
import { PackTile } from '../../../components/PackTile';
import { AppBar, Button, Glide, IconBadge, PressScale, ProgressBar, spacing, Text } from '../../../design';
import { addReceivedQty, findOpenItemByBarcode, OrderItem } from '../../../db/orders';
import { enqueue } from '../../../db/outbox';
import { trackExpiry } from '../../../db/expiry';
import { findProduct, Product } from '../../../db/products';
import {
  findCanonicalProductByBarcode,
  findOpenItemByProductId,
  learnBarcode,
} from '../../../db/catalog';
import { adjustOnHand, findStock, snapshotOpeningLocal, upsertStock } from '../../../db/stock';
import { addLotLocal } from '../../../db/lots';
import { getSession } from '../../../auth/session';
import { useT } from '../../../i18n';
import { useCan } from '../../../auth';
import { NoPermission } from '../../../components/NoPermission';
import { useTheme } from '../../../theme';
import { RootStackParamList } from '../../../navigation/types';
import { flushOnce } from '../../../sync/syncService';
import { haptic } from '../../../utils/haptics';
import { expiryUrgency, formatExpiry, relativeExpiry } from '../../../utils/expiry';
import { useOrderSession } from '../components/OrderSessionContext';
import { CameraSheet, ItemPhoto } from '../components/ItemPhoto';
import { discardPhoto, newDeliveryId, queueItemPhoto } from '../itemPhoto';
import { useKeyboardHeight } from '../../../hooks/useKeyboardHeight';
import type { Batch } from '../components/BatchEditor';
import { ExpiryGroups } from '../components/ExpiryGroups';
import { DatePickerModal } from '../components/DatePickerModal';
import { categoryIcon } from '../categoryIcon';
import { formatAmount, formatSmall, productShape, smallStep, smallToPacks, smallUnit } from '../../../units';

type Props = NativeStackScreenProps<RootStackParamList, 'Receiving'>;

/** Date → ISO YYYY-MM-DD (the format lots and expiry use). */
function toISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function ReceivingScreen({ route, navigation }: Props) {
  const t = useT();
  const can = useCan();
  const { palette } = useTheme();
  const kbHeight = useKeyboardHeight();
  const { barcode, productId, productName: paramProductName, unit: paramUnit, packSize: paramPackSize } = route.params;
  const orderSession = useOrderSession();
  const [product, setProduct] = useState<Product | null>(null);
  // Fallback identity for barcodes we were handed WITHOUT route params —
  // e.g. the Stock screen's "Received" action, which only knows the
  // barcode. Resolved from the canonical catalog, then the local stock
  // row. Without this the screen printed the barcode next to the word
  // "Unknown" for products the guard had already linked.
  const [fallback, setFallback] = useState<{
    name: string;
    unit: string | null;
    packSize: number | null;
    category: string | null;
  } | null>(null);
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
  // Most deliveries are one amount with one expiry. The per-batch editor
  // only appears when someone says the packs carry different dates.
  const [multiExpiry, setMultiExpiry] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const single = batches[0] ?? { qty: 1, expiry: undefined };
  const setSingle = (next: Partial<Batch>) => setBatches([{ ...single, ...next }]);
  // "Not a full pack?": a loose amount in grams/ml/pieces (e.g. 2 kg 500 g
  // from the market). null = counting whole packs, the usual delivery.
  const [looseSmall, setLooseSmall] = useState<number | null>(null);
  const [flagCamera, setFlagCamera] = useState(false);
  // This item's proof photo: all its packs together, required before it is added.
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  // Leaving without adding throws the photo away; once added, the delivery owns it.
  const photoRef = useRef<string | null>(null);
  const handedOff = useRef(false);
  useEffect(() => {
    photoRef.current = photoUri;
  }, [photoUri]);
  useEffect(() => () => {
    if (!handedOff.current) discardPhoto(photoRef.current);
  }, []);

  // Identity resolution, most-specific first: route params (the scanner
  // already resolved it) → legacy local products row → canonical catalog
  // / stock cache. Only a barcode nothing on the device recognises falls
  // through to "Unknown".
  const resolvedName = paramProductName ?? product?.name ?? fallback?.name ?? 'Unknown';
  const resolvedUnit = paramUnit ?? product?.unit ?? fallback?.unit ?? null;
  const resolvedPackSize = paramPackSize ?? product?.pack_size ?? fallback?.packSize ?? null;
  const resolvedCategory = product?.category ?? fallback?.category ?? null;
  const packDisplay =
    resolvedPackSize != null && resolvedUnit
      ? `${resolvedPackSize} ${resolvedUnit}`
      : resolvedUnit ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = await findProduct(barcode);
      if (cancelled) return;
      setProduct(local);

      // Catalog first (canonical name + authoritative pack size), stock
      // cache second (whatever the last sync knew this barcode as).
      const canonical = await findCanonicalProductByBarcode(barcode).catch(() => null);
      const stockRow = await findStock(barcode);
      if (cancelled) return;
      if (canonical) {
        setFallback({
          name: canonical.canonical_name,
          unit: canonical.unit ?? null,
          packSize: canonical.pack_size ?? null,
          category: canonical.category ?? null,
        });
      } else if (stockRow) {
        setFallback({
          name: stockRow.name,
          unit: stockRow.unit ?? null,
          packSize: stockRow.pack_size ?? null,
          category: stockRow.category ?? null,
        });
      } else {
        setFallback(null);
      }

      // If we have a productId from catalog, look up order item by product_id
      const openItem = productId
        ? ((await findOpenItemByProductId(productId)) as OrderItem | null)
        : await findOpenItemByBarcode(barcode);
      if (cancelled) return;
      setItem(openItem);
    })();
    return () => { cancelled = true; };
  }, [barcode, productId]);

  /** Convert a "packs received" integer into the units stored in lots:
   *  Under the new unit-aware system, all stock is stored in packs. */
  const toLotQty = (packsQty: number): number => {
    return packsQty;
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
  const persistStandalone = async (flagged: boolean, photoUri: string) => {
    const session = getSession();
    // A standalone save is a delivery of its own, with its own proof photo.
    const deliveryId = newDeliveryId();
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
        delivery_id: deliveryId,
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
    // After its receipts, so the server posts them together.
    const photoId = await queueItemPhoto({ deliveryId, receiptIds: receipts.map((r) => r.id), photoUri });

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
        category: resolvedCategory,
        unit: resolvedUnit,
        pack_size: resolvedPackSize,
        dispense_mode: 'pack',
        on_hand: totalLotQty,
        threshold: 0,
      });
    }

    // Goods just arrived — this is the new "full" for the stock list's
    // "left of stocked" bar. Server does the same in addLot; doing it
    // locally too stops the bar flashing a stale baseline until sync.
    await snapshotOpeningLocal(barcode);

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
    return photoId;
  };

  /** Add to order session */
  const addToSession = () => {
    if (!photoUri) {
      setCameraOpen(true);
      return;
    }
    const cleanBatches = batches.filter((b) => b.qty > 0);
    const totalQty = cleanBatches.reduce((s, b) => s + b.qty, 0);

    orderSession.addItem({
      barcode,
      productId: productId ?? null,
      name: resolvedName,
      category: resolvedCategory,
      unit: resolvedUnit,
      packSize: resolvedPackSize,
      qty: totalQty,
      // Coerce tri-state expiry into the binary string|null the session
      // expects — submit shouldn't carry an indecision past this point.
      batches: cleanBatches.map((b) => ({ qty: b.qty, expiry: b.expiry ?? null, photoUri })),
    });
    handedOff.current = true;
    haptic.success();
    navigation.navigate('OrderSession');
  };

  /** Flag: photo first (the camera opens), then it saves on "Use this photo". */
  const flagAndContinueStandalone = async (photoUri: string) => {
    setSaving(true);
    try {
      const photoId = await persistStandalone(true, photoUri);
      haptic.warn();
      navigation.replace('DeliverySummary', {
        items: [{ name: resolvedName, category: resolvedCategory, qty, photoIds: [photoId] }],
        totalItems: 1,
        totalQty: qty,
        productName: resolvedName,
        qty,
        expected: item?.expected_qty ?? null,
        flagged: true,
        withPhoto: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const expected = item?.expected_qty ?? null;
  const alreadyIn = item?.received_qty ?? 0;
  const projected = alreadyIn + qty;
  const mismatch = expected !== null && projected > expected;

  // Reached without the right role (old deep link, role changed meanwhile).
  // After every hook on purpose: hooks must run in the same order each render.
  if (!can('inventory.receive')) {
    return <NoPermission title={t('receiveItem')} onBack={() => navigation.goBack()} />;
  }

  const shape = productShape(resolvedPackSize, resolvedUnit);
  const ItemIcon = categoryIcon(resolvedCategory);
  const urgency = expiryUrgency(single.expiry ?? null);
  const expiryColor = urgency === 'expired' ? palette.error : urgency === 'soon' ? palette.amber : palette.onSurface;
  const orderFill = expected ? Math.min(1, projected / expected) : 0;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'height' : undefined} style={{ flex: 1 }}>
      <View style={[styles.safe, { backgroundColor: palette.background }]}>
        <AppBar title={t('receiveItem')} onBack={() => navigation.goBack()} />

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: spacing.xxxl + kbHeight }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* What arrived: the product, not its barcode. */}
          <View style={styles.product}>
            <IconBadge Icon={ItemIcon} size={56} />
            <View style={{ flex: 1 }}>
              <Text variant="titleLarge" style={{ fontWeight: '700' }} numberOfLines={2}>
                {resolvedName}
              </Text>
              <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
                {[packDisplay, barcode.startsWith('catalog_') ? t('noBarcodeYet') : barcode].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>

          {/* Against the open order, when there is one. */}
          {expected !== null ? (
            <View style={[styles.card, { borderColor: mismatch ? palette.error : palette.outlineVariant }]}>
              <View style={styles.cardHead}>
                <Text variant="titleMedium" style={{ fontWeight: '600' }}>
                  {t('onOrderTitle')}
                </Text>
                <Text variant="bodyLarge" color={mismatch ? palette.error : palette.onSurfaceVariant}>
                  {t('receivedOfExpected', { received: projected, expected })}
                </Text>
              </View>
              <ProgressBar fill={orderFill} color={mismatch ? palette.error : palette.success} track={palette.surfaceContainerHigh} />
              {mismatch ? (
                <View style={styles.warnRow}>
                  <AlertTriangle size={18} color={palette.error} />
                  <Text variant="bodyMedium" color={palette.error}>
                    {t('overOrderedBy', { n: projected - expected })}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
              {t('notOnOrder')}
            </Text>
          )}

          {multiExpiry ? (
            <Glide appear key="multi" style={{ gap: spacing.xxl }}>
              <Question Icon={CalendarDays} text={t('differentDatesTitle')} />
              <ExpiryGroups batches={batches} onChange={setBatches} Icon={ItemIcon} single={shape === 'single'} />
              <Button
                label={t('sameExpiry')}
                variant="text"
                size="md"
                onPress={() => {
                  setBatches([{ qty, expiry: sortedFirstExpiry(batches) }]);
                  setMultiExpiry(false);
                }}
              />
            </Glide>
          ) : (
            <Glide key="single" style={{ gap: spacing.xxl }}>
              {looseSmall === null ? (
                <Glide appear key="packs">
                  <Question pic={<PackTile kind={shape === 'single' ? 'single' : 'closed'} Icon={ItemIcon} size="sm" />} text={t('howManyPacks')} />
                  <AmountStepper value={single.qty} onChange={(n) => setSingle({ qty: n })} min={1} unitLabel={t('packsWord')} />
                  <View style={{ marginTop: spacing.md }}>
                    <PackIcons count={single.qty} Icon={ItemIcon} single={shape === 'single'} />
                  </View>
                  {shape !== 'single' ? (
                    <Pressable
                      onPress={() => {
                        const start = smallStep(resolvedPackSize, resolvedUnit) * 10;
                        setLooseSmall(start);
                        setSingle({ qty: smallToPacks(start, resolvedPackSize, resolvedUnit) });
                      }}
                      style={[styles.softBtn, { backgroundColor: palette.surfaceContainerLow }]}
                      accessibilityRole="button"
                    >
                      <PackTile kind="open" Icon={ItemIcon} size="sm" fill={0.5} />
                      <Text variant="bodyLarge" color={palette.primary} style={{ fontWeight: '600', flex: 1 }}>
                        {t('notAFullPack')}
                      </Text>
                    </Pressable>
                  ) : null}
                </Glide>
              ) : (
                <Glide appear key="loose">
                  <Question pic={<PackTile kind="open" Icon={ItemIcon} size="sm" fill={0.5} />} text={t('howMuchArrived')} />
                  <AmountStepper
                    value={looseSmall}
                    onChange={(n) => {
                      setLooseSmall(n);
                      setSingle({ qty: smallToPacks(n, resolvedPackSize, resolvedUnit) });
                    }}
                    min={1}
                    step={smallStep(resolvedPackSize, resolvedUnit)}
                    unitLabel={looseSmall >= smallUnit(resolvedUnit).perBase && smallUnit(resolvedUnit).perBase > 1
                      ? formatSmall(looseSmall, resolvedUnit)
                      : smallUnit(resolvedUnit).symbol}
                  />
                  <Pressable
                    onPress={() => {
                      setLooseSmall(null);
                      setSingle({ qty: 1 });
                    }}
                    style={[styles.softBtn, { backgroundColor: palette.surfaceContainerLow }]}
                    accessibilityRole="button"
                  >
                    <PackTile kind="closed" Icon={ItemIcon} size="sm" />
                    <Text variant="bodyLarge" color={palette.primary} style={{ fontWeight: '600', flex: 1 }}>
                      {t('countFullPacks')}
                    </Text>
                  </Pressable>
                </Glide>
              )}

              <Glide>
                <Question Icon={CalendarDays} text={t('expiryDateTitle')} />
                {single.expiry === undefined ? (
                  <Glide appear key="choose" style={styles.choiceRow}>
                    <Choice Icon={CalendarDays} label={t('pickExpiry')} onPress={() => setPickingDate(true)} primary />
                    <Choice Icon={CalendarOff} label={t('noExpiry')} onPress={() => setSingle({ expiry: null })} />
                  </Glide>
                ) : (
                  <Glide appear key="chosen" style={[styles.chosen, { borderColor: palette.outlineVariant }]}>
                    <DateTile iso={single.expiry} size="md" />
                    <View style={{ flex: 1 }}>
                      <Text variant="titleMedium" color={single.expiry ? expiryColor : palette.onSurface} style={{ fontWeight: '600' }}>
                        {single.expiry ? formatExpiry(single.expiry) : t('noExpiry')}
                      </Text>
                      {single.expiry ? (
                        <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
                          {relativeExpiry(single.expiry, t)}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable onPress={() => setPickingDate(true)} hitSlop={8}>
                      <Text variant="labelLarge" color={palette.primary} style={{ fontWeight: '700' }}>
                        {t('changeAction')}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => setSingle({ expiry: undefined })} hitSlop={10} accessibilityLabel="Clear">
                      <X size={20} color={palette.onSurfaceVariant} />
                    </Pressable>
                  </Glide>
                )}
                {looseSmall === null ? (
                  <Pressable
                    onPress={() => {
                      setMultiExpiry(true);
                    }}
                    style={[styles.softBtn, { backgroundColor: palette.surfaceContainerLow }]}
                    accessibilityRole="button"
                  >
                    <CalendarPlus size={20} color={palette.primary} />
                    <Text variant="bodyLarge" color={palette.primary} style={{ fontWeight: '600', flex: 1 }}>
                      {t('differentExpiries')}
                    </Text>
                  </Pressable>
                ) : null}
              </Glide>
            </Glide>
          )}

          {/* The proof: all of this item's packs together in one photo. */}
          <Glide>
          <ItemPhoto
            uri={photoUri}
            onChange={setPhotoUri}
            amount={
              looseSmall !== null
                ? formatSmall(looseSmall, resolvedUnit)
                : qty === 1
                  ? null
                  : formatAmount(qty, resolvedPackSize, resolvedUnit)
            }
            cameraOpen={cameraOpen}
            onCameraOpenChange={setCameraOpen}
          />
          </Glide>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: palette.background, borderTopColor: palette.outlineVariant }]}>
          {/* The photo is required: until it exists, the main button takes it. */}
          <Button
            label={photoUri ? t('addToOrder') : t('takeItemPhoto')}
            onPress={addToSession}
            loading={saving}
            size="lg"
            fullWidth
            Icon={photoUri ? Check : Camera}
          />
          {!orderSession.isActive && mismatch ? (
            <Button
              label={t('flagAndContinue')}
              onPress={() => {
                if (photoUri) {
                  handedOff.current = true;
                  void flagAndContinueStandalone(photoUri);
                } else {
                  setFlagCamera(true);
                }
              }}
              variant="danger"
              loading={saving}
              size="md"
              fullWidth
              style={{ marginTop: spacing.sm }}
            />
          ) : null}
          <Button label={t('cancel')} variant="text" size="md" onPress={() => navigation.navigate('Home')} style={{ marginTop: spacing.xs }} />
        </View>

        {/* Flagging saves straight away, so its proof photo is taken here. */}
        <CameraSheet
          visible={flagCamera}
          onClose={() => setFlagCamera(false)}
          onPhoto={(uri) => {
            setFlagCamera(false);
            setPhotoUri(uri);
            handedOff.current = true;
            void flagAndContinueStandalone(uri);
          }}
        />

        <DatePickerModal
          visible={pickingDate}
          value={single.expiry ? new Date(single.expiry) : null}
          minimumDate={new Date()}
          onSelect={(d) => {
            setSingle({ expiry: toISO(d) });
            setPickingDate(false);
          }}
          onDismiss={() => setPickingDate(false)}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

/** Earliest picked expiry across batches (used when collapsing back to one). */
function sortedFirstExpiry(batches: Batch[]): string | null | undefined {
  const dated = batches.map((b) => b.expiry).filter((e): e is string => !!e).sort();
  if (dated.length > 0) return dated[0];
  return batches.some((b) => b.expiry === null) ? null : undefined;
}

/**
 * A question with its picture, so the icon carries it even before the
 * words. Amount questions pass the shelf's own pack picture as `pic`.
 */
function Question({ Icon, pic, text }: { Icon?: LucideIcon; pic?: React.ReactNode; text: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.questionRow}>
      {pic ? (
        <View style={[styles.questionIcon, { width: 40 }]}>{pic}</View>
      ) : Icon ? (
        <View style={[styles.questionIcon, { backgroundColor: palette.primaryContainer }]}>
          <Icon size={22} color={palette.onPrimaryContainer} />
        </View>
      ) : null}
      <Text variant="titleMedium" style={{ fontWeight: '700', flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/** A big tappable choice: icon + words, outlined (or tinted when primary). */
function Choice({ Icon, label, onPress, primary }: { Icon: typeof CalendarDays; label: string; onPress: () => void; primary?: boolean }) {
  const { palette } = useTheme();
  return (
    <PressScale
      to={0.96}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={[
        styles.choice,
        { borderColor: primary ? palette.primary : palette.outlineVariant, backgroundColor: primary ? palette.primaryContainer : palette.surfaceContainerLowest },
      ]}
    >
      <Icon size={20} color={primary ? palette.onPrimaryContainer : palette.onSurfaceVariant} />
      <Text variant="titleMedium" color={primary ? palette.onPrimaryContainer : palette.onSurface} style={{ fontWeight: '600' }}>
        {label}
      </Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.xxl },
  product: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  card: { borderWidth: 1, borderRadius: 18, padding: spacing.lg, gap: spacing.sm },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  questionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  questionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  choiceRow: { flexDirection: 'row', gap: spacing.md },
  choice: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
  },
  softBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, paddingHorizontal: spacing.lg, minHeight: 52, borderRadius: 14 },
  chosen: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderRadius: 16, padding: spacing.md },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
});

