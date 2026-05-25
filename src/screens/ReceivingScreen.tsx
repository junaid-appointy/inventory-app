import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { nanoid } from 'nanoid/non-secure';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  AppBar,
  Button,
  Card,
  palette,
  radius,
  spacing,
  StatusPill,
  Text,
} from '../design';
import { addReceivedQty, findOpenItemByBarcode, OrderItem } from '../db/orders';
import { enqueue } from '../db/outbox';
import { findProduct, Product } from '../db/products';
import { RootStackParamList } from '../navigation/types';
import { flushOnce } from '../sync/syncService';
import { haptic } from '../utils/haptics';

type Props = NativeStackScreenProps<RootStackParamList, 'Receiving'>;

export function ReceivingScreen({ route, navigation }: Props) {
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

  const bump = (n: number) => {
    haptic.tap();
    setQty((q) => Math.max(1, q + n));
  };
  const setExact = (n: number) => {
    haptic.tap();
    setQty(n);
  };

  const confirm = async () => {
    setSaving(true);
    try {
      const id = `rcp_${nanoid(12)}`;
      await enqueue('receipt', {
        id,
        order_id: item?.order_id ?? null,
        order_item_id: item?.id ?? null,
        barcode,
        product_name: product?.name ?? 'Unknown',
        qty,
        scanned_at: Date.now(),
      });
      if (item) await addReceivedQty(item.id, qty);
      flushOnce().catch(() => {});
      haptic.success();
      navigation.replace('Scanner');
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
        title="Receive item"
        onBack={() => navigation.popToTop()}
        trailing={
          expected !== null ? (
            <StatusPill
              label={`${projected} / ${expected}`}
              tone={mismatch ? 'danger' : projected === expected ? 'success' : 'neutral'}
            />
          ) : null
        }
      />

      <View style={styles.content}>
        <Card tone="elevated" padding="xl">
          <Text variant="labelLarge" color={palette.onSurfaceVariant}>
            PRODUCT
          </Text>
          <Text variant="headlineSmall" style={{ marginTop: spacing.xs }}>
            {product?.name ?? 'Unknown product'}
          </Text>
          <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.xs }}>
            {barcode}
          </Text>
          {expected !== null ? (
            <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.md }}>
              Expected {expected} · {alreadyIn} already received
            </Text>
          ) : (
            <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.md }}>
              No matching order — capture stands alone.
            </Text>
          )}
        </Card>

        <View style={styles.qtySection}>
          <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ textAlign: 'center' }}>
            QUANTITY RECEIVED
          </Text>
          <View style={styles.stepperRow}>
            <Stepper icon="−" onPress={() => bump(-1)} />
            <Text variant="displayLarge" style={styles.qtyNum}>
              {qty}
            </Text>
            <Stepper icon="+" onPress={() => bump(1)} />
          </View>
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
                leadingIcon="⚠"
              />
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.footer}>
        <Button
          label="Confirm received"
          onPress={confirm}
          loading={saving}
          size="lg"
          fullWidth
          leadingIcon={
            <Text variant="titleLarge" color={palette.onPrimary}>
              ✓
            </Text>
          }
        />
        <Button
          label="Cancel"
          variant="text"
          onPress={() => navigation.popToTop()}
          style={{ marginTop: spacing.sm }}
        />
      </View>
    </View>
  );
}

function Stepper({ icon, onPress }: { icon: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: palette.outlineVariant, borderless: true, radius: 44 }}
      style={styles.stepper}
    >
      <Text variant="displayMedium" color={palette.onPrimary}>
        {icon}
      </Text>
    </Pressable>
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
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  stepper: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  qtyNum: { minWidth: 120, textAlign: 'center' },
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
