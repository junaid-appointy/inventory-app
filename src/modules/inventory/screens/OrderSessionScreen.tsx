import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check, ScanLine, Trash2, X } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import {
  AppBar,
  Button,
  Card,
  radius,
  spacing,
  Text,
} from '../../../design';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { haptic } from '../../../utils/haptics';
import { useOrderSession, OrderSessionItem } from '../components/OrderSessionContext';
import { useTheme } from '../../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderSession'>;

export function OrderSessionScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const { items, removeItem, submitAll, clear, isActive } = useOrderSession();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (items.length === 0) return;
    setSubmitting(true);
    try {
      await submitAll();
      haptic.success();
      navigation.replace('DeliverySummary', {
        items: items.map((i) => ({
          name: i.name,
          category: i.category,
          qty: i.qty,
        })),
        totalItems: items.length,
        totalQty: items.reduce((sum, i) => sum + i.qty, 0),
      });
    } finally {
      setSubmitting(false);
    }
  }, [items, submitAll, navigation]);

  const handleCancel = useCallback(() => {
    Alert.alert(
      'Cancel Order',
      `Discard all ${items.length} scanned item${items.length === 1 ? '' : 's'}?`,
      [
        { text: 'Keep scanning', style: 'cancel' },
        {
          text: 'Discard all',
          style: 'destructive',
          onPress: () => {
            clear();
            haptic.warn();
            navigation.popToTop();
          },
        },
      ],
    );
  }, [items.length, clear, navigation]);

  const handleRemoveItem = useCallback(
    (barcode: string, name: string) => {
      Alert.alert('Remove item', `Remove "${name}" from this order?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            removeItem(barcode);
            haptic.tap();
          },
        },
      ]);
    },
    [removeItem],
  );

  const renderItem = useCallback(
    ({ item }: { item: OrderSessionItem }) => (
      <Card tone="filled" padding="lg">
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium">{item.name}</Text>
            <Text
              variant="bodyMedium"
              color={palette.onSurfaceVariant}
              style={{ marginTop: 2 }}
            >
              {item.category ?? '—'}
              {item.expiryDate ? ` · Exp: ${formatDate(item.expiryDate)}` : ''}
            </Text>
          </View>
          <View style={[styles.qtyBadge, { backgroundColor: palette.primaryContainer }]}>
            <Text variant="titleLarge" color={palette.primary}>
              {item.qty}
            </Text>
          </View>
          <Pressable
            onPress={() => handleRemoveItem(item.barcode, item.name)}
            hitSlop={12}
            style={styles.deleteBtn}
          >
            <Trash2 size={20} color={palette.error} strokeWidth={2.2} />
          </Pressable>
        </View>
      </Card>
    ),
    [handleRemoveItem],
  );

  return (
    <View style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar
        title={`Order — ${items.length} item${items.length === 1 ? '' : 's'}`}
        subtitle={`Total: ${items.reduce((s, i) => s + i.qty, 0)} units`}
        onBack={() => navigation.goBack()}
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.barcode}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text
              variant="headlineSmall"
              style={{ textAlign: 'center' }}
            >
              No items scanned yet
            </Text>
            <Text
              variant="bodyLarge"
              color={palette.onSurfaceVariant}
              style={{ textAlign: 'center', marginTop: spacing.sm }}
            >
              {t('scanNextItem')} — {t('addToOrder').toLowerCase()}.
            </Text>
          </View>
        }
      />

      <View style={[styles.footer, { backgroundColor: palette.surface, borderTopColor: palette.outlineVariant }]}>
        <Button
          label={t('scanNextItem')}
          leadingIcon={<ScanLine size={22} color={palette.onPrimary} strokeWidth={2.4} />}
          size="lg"
          fullWidth
          onPress={() => navigation.navigate('Scanner')}
        />
        {items.length > 0 && (
          <>
            <Button
              label={`${t('submitOrder')} (${items.length})`}
              variant="tonal"
              leadingIcon={<Check size={22} color={palette.onSecondaryContainer} strokeWidth={2.4} />}
              size="lg"
              fullWidth
              onPress={handleSubmit}
              loading={submitting}
              style={{ marginTop: spacing.sm }}
            />
            <Button
              label={t('cancelOrder')}
              variant="text"
              onPress={handleCancel}
              style={{ marginTop: spacing.xs }}
            />
          </>
        )}
      </View>
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1)
      .toString()
      .padStart(2, '0')}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  qtyBadge: {
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  empty: { padding: spacing.xxl },
  deleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
  },
});
