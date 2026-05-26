import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AlertTriangle, Check, ScanLine } from 'lucide-react-native';
import { nanoid } from 'nanoid/non-secure';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  AppBar,
  Button,
  Card,
  IconButton,
  palette,
  QtyStepper,
  radius,
  spacing,
  StatusPill,
  Text,
} from '../../../design';
import { addReceivedQty, findOpenItemByBarcode, OrderItem } from '../../../db/orders';
import { enqueue } from '../../../db/outbox';
import { findProduct, Product } from '../../../db/products';
import { adjustOnHand, findStock, upsertStock } from '../../../db/stock';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { flushOnce } from '../../../sync/syncService';
import { haptic } from '../../../utils/haptics';

type Props = NativeStackScreenProps<RootStackParamList, 'Receiving'>;

export function ReceivingScreen({ route, navigation }: Props) {
  const t = useT();
  const { barcode } = route.params;
  const [product, setProduct] = useState<Product | null>(null);
  const [item, setItem] = useState<OrderItem | null>(null);
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setProduct(await findProduct(barcode));
      setItem(await findOpenItemByBarcode(barcode));
    })();
  }, [barcode]);

  const setExact = (n: number) => {
    haptic.tap();
    setQty(n);
  };

  const persist = async (flagged: boolean) => {
    const id = `rcp_${nanoid(12)}`;
    await enqueue('receipt', {
      id,
      order_id: item?.order_id ?? null,
      order_item_id: item?.id ?? null,
      barcode,
      product_name: product?.name ?? 'Unknown',
      qty,
      flagged,
      scanned_at: Date.now(),
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

    // Roll the received qty into on-hand stock. Create the row if this
    // product hasn't been tracked before so it shows up on Stock/Alerts.
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
  };

  const goToSummary = (flagged: boolean) => {
    navigation.replace('DeliverySummary', {
      productName: product?.name ?? 'Unknown',
      qty,
      expected: item?.expected_qty ?? null,
      flagged,
    });
  };

  const confirm = async () => {
    setSaving(true);
    try {
      await persist(false);
      haptic.success();
      goToSummary(false);
    } finally {
      setSaving(false);
    }
  };

  const flagAndContinue = async () => {
    setSaving(true);
    try {
      await persist(true);
      haptic.warn();
      goToSummary(true);
    } finally {
      setSaving(false);
    }
  };

  const expected = item?.expected_qty ?? null;
  const alreadyIn = item?.received_qty ?? 0;
  const projected = alreadyIn + qty;
  const mismatch = expected !== null && projected > expected;

  return (
    <View style={styles.safe}>
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

      <View style={styles.content}>
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
      </View>

      <View style={styles.footer}>
        {mismatch ? (
          <Button
            label={t('flagAndContinue')}
            onPress={flagAndContinue}
            variant="danger"
            loading={saving}
            size="lg"
            fullWidth
            leadingIcon={<AlertTriangle size={22} color={palette.onErrorContainer} strokeWidth={2.4} />}
          />
        ) : (
          <Button
            label={t('confirmReceived')}
            onPress={confirm}
            loading={saving}
            size="lg"
            fullWidth
            leadingIcon={<Check size={22} color={palette.onPrimary} strokeWidth={2.4} />}
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
  safe: { flex: 1, backgroundColor: palette.background },
  content: { flex: 1, padding: spacing.xl, gap: spacing.xl },
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
  footer: {
    padding: spacing.xl,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.outlineVariant,
  },
});
