import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check, ScanLine, Trash2 } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { formatExpiry } from '../../../utils/expiry';
import { AppBar, Button, IconBadge, RowDivider, spacing, Text } from '../../../design';
import { categoryIcon } from '../categoryIcon';
import { formatAmount } from '../../../units';
import { useT } from '../../../i18n';
import { StringKey, TParams } from '../../../i18n/strings';
import { RootStackParamList } from '../../../navigation/types';
import { haptic } from '../../../utils/haptics';
import { useOrderSession, OrderSessionItem, OrderBatch } from '../components/OrderSessionContext';
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
      const photoIds = await submitAll();
      haptic.success();
      navigation.replace('DeliverySummary', {
        items: items.map((i) => ({
          name: i.name,
          category: i.category,
          qty: i.qty,
          label: formatAmount(i.qty, i.packSize, i.unit),
          photoIds: photoIds[i.barcode] ?? [],
        })),
        totalItems: items.length,
        totalQty: items.reduce((sum, i) => sum + i.qty, 0),
        withPhoto: true,
      });
    } finally {
      setSubmitting(false);
    }
  }, [items, submitAll, navigation]);

  const handleCancel = useCallback(() => {
    Alert.alert(
      t('cancelOrder'),
      t('discardScannedItems', { count: items.length }),
      [
        { text: t('keepScanning'), style: 'cancel' },
        {
          text: t('discardAll'),
          style: 'destructive',
          onPress: () => {
            clear();
            haptic.warn();
            navigation.navigate('Home');
          },
        },
      ],
    );
  }, [items.length, clear, navigation, t]);

  const handleRemoveItem = useCallback(
    (barcode: string, name: string) => {
      Alert.alert(t('removeItem'), t('removeItemBody', { name }), [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('remove'),
          style: 'destructive',
          onPress: () => {
            removeItem(barcode);
            haptic.tap();
          },
        },
      ]);
    },
    [removeItem, t],
  );

  const totalPacks = items.reduce((sum, i) => sum + i.qty, 0);

  const renderItem = useCallback(
    ({ item }: { item: OrderSessionItem }) => (
      <View style={styles.row}>
        {/* Its proof photo stands for the item; the icon only if there is none. */}
        {item.batches.find((b) => b.photoUri)?.photoUri ? (
          <Image
            source={{ uri: item.batches.find((b) => b.photoUri)!.photoUri! }}
            style={[styles.thumb, { backgroundColor: palette.surfaceContainerHigh }]}
            accessibilityLabel={item.name}
          />
        ) : (
          <IconBadge Icon={categoryIcon(item.category)} size={48} />
        )}
        <View style={{ flex: 1 }}>
          <Text variant="titleMedium" numberOfLines={1} style={{ fontWeight: '600' }}>
            {item.name}
          </Text>
          <Text variant="bodyMedium" color={palette.onSurfaceVariant} numberOfLines={1} style={{ marginTop: 2 }}>
            {[formatPack(item), formatBatches(item.batches, t)].filter(Boolean).join(' · ') || ' '}
          </Text>
        </View>
        <Text variant="headlineSmall" style={{ fontWeight: '800' }}>
          {Number.isInteger(item.qty) ? item.qty : formatAmount(item.qty, item.packSize, item.unit)}
        </Text>
        <Pressable
          onPress={() => handleRemoveItem(item.barcode, item.name)}
          hitSlop={12}
          style={styles.deleteBtn}
          accessibilityLabel={t('removeItem')}
        >
          <Trash2 size={20} color={palette.onSurfaceVariant} strokeWidth={2} />
        </Pressable>
      </View>
    ),
    [handleRemoveItem, palette, t],
  );

  return (
    <View style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar
        title={t('thisDelivery')}
        subtitle={items.length > 0 ? t('deliveryCount', { items: items.length, packs: totalPacks }) : undefined}
        onBack={() => navigation.goBack()}
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.barcode}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <RowDivider />}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="titleLarge" style={{ textAlign: 'center' }}>
              {t('noItemsScanned')}
            </Text>
            <Text variant="bodyLarge" color={palette.onSurfaceVariant} style={{ textAlign: 'center', marginTop: spacing.sm }}>
              {t('deliveryEmptyHint')}
            </Text>
          </View>
        }
      />

      <View style={[styles.footer, { backgroundColor: palette.background, borderTopColor: palette.outlineVariant }]}>
        <View style={styles.footerRow}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('scanNextItem')}
              variant={items.length > 0 ? 'outlined' : 'filled'}
              Icon={ScanLine}
              size="lg"
              fullWidth
              onPress={() => navigation.navigate('Scanner')}
            />
          </View>
          {items.length > 0 ? (
            <View style={{ flex: 1 }}>
              <Button
                label={t('finishShort', { n: items.length })}
                Icon={Check}
                size="lg"
                fullWidth
                onPress={handleSubmit}
                loading={submitting}
              />
            </View>
          ) : null}
        </View>
        {items.length > 0 ? (
          <Button label={t('cancelOrder')} variant="text" size="md" onPress={handleCancel} style={{ marginTop: spacing.xs }} />
        ) : null}
      </View>
    </View>
  );
}

/** "500 g pack", or "" when the pack size says nothing extra. */
function formatPack(item: OrderSessionItem): string {
  const hasPack = item.packSize != null && item.packSize !== 1;
  if (!hasPack) return item.category ?? '';
  return `${item.packSize}${item.unit ? ` ${item.unit}` : ''}`;
}

function formatBatches(
  batches: OrderBatch[],
  t: (key: StringKey, params?: TParams) => string,
): string {
  const dated = batches.filter((b) => b.expiry);
  if (dated.length === 0) return '';
  const unique = Array.from(new Set(dated.map((b) => b.expiry as string))).sort();
  if (unique.length === 1) return t('expShort', { date: formatExpiry(unique[0]) });
  return t('expiriesEarliest', { count: unique.length, date: formatExpiry(unique[0]) });
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, minHeight: 72, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  empty: { padding: spacing.xxl },
  thumb: { width: 48, height: 48, borderRadius: 12 },
  deleteBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  footerRow: { flexDirection: 'row', gap: spacing.md },
});
