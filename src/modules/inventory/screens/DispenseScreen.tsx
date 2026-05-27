import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check } from 'lucide-react-native';
import { nanoid } from 'nanoid/non-secure';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  AppBar,
  Button,
  Card,
  Chip,
  QtyStepper,
  radius,
  Skeleton,
  spacing,
  Text,
  TextField,
} from '../../../design';
import { enqueue } from '../../../db/outbox';
import { adjustOnHand, findStock, listStock, StockRow, statusFor } from '../../../db/stock';
import { getSession } from '../../../auth/session';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { flushOnce } from '../../../sync/syncService';
import { haptic } from '../../../utils/haptics';
import { FilterDropdown, FilterOption } from '../components/FilterDropdown';
import { useTheme } from '../../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Dispense'>;

const REASONS = ['Office use', 'Pantry', 'Cleaning', 'Maintenance', 'Other'];

const STATUS_OPTIONS: FilterOption[] = [
  { key: 'All', label: 'All Status' },
  { key: 'In Stock', label: 'In Stock' },
  { key: 'Low', label: 'Low' },
  { key: 'Out', label: 'Out of Stock' },
];

/** Subtle background tint per stock health */
function cardBg(row: StockRow): string {
  const s = statusFor(row);
  if (s === 'out') return 'rgba(229, 57, 53, 0.07)';
  if (s === 'low') return 'rgba(249, 168, 37, 0.07)';
  if (row.on_hand >= row.threshold * 2) return 'rgba(67, 160, 71, 0.06)';
  return 'rgba(129, 199, 132, 0.06)';
}

/** Count text color per stock health */
function countColor(row: StockRow): string {
  const s = statusFor(row);
  if (s === 'out') return '#E53935';
  if (s === 'low') return '#F9A825';
  if (row.on_hand >= row.threshold * 2) return '#43A047';
  return '#66BB6A';
}

export function DispenseScreen({ route, navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const initialBarcode = route.params?.barcode;
  const [selected, setSelected] = useState<StockRow | null>(null);
  const [all, setAll] = useState<StockRow[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState(REASONS[0]);
  const [who, setWho] = useState('');
  const [saving, setSaving] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const categoryOptions = useMemo<FilterOption[]>(() => {
    const cats = new Set(all.map((r) => r.category).filter(Boolean) as string[]);
    return [{ key: 'All', label: 'All Categories' }, ...Array.from(cats).sort().map((c) => ({ key: c, label: c }))];
  }, [all]);

  useEffect(() => {
    listStock().then((rows) => {
      setAll(rows);
      setInitialLoading(false);
    });
  }, []);

  useEffect(() => {
    if (initialBarcode) {
      findStock(initialBarcode).then((r) => r && setSelected(r));
    }
  }, [initialBarcode]);

  const results = useMemo(() => {
    if (selected) return [];
    const q = query.trim().toLowerCase();
    return all
      .filter((r) => {
        if (category !== 'All' && r.category !== category) return false;
        if (statusFilter !== 'All') {
          const s = statusFor(r);
          if (statusFilter === 'In Stock' && s !== 'ok') return false;
          if (statusFilter === 'Low' && s !== 'low') return false;
          if (statusFilter === 'Out' && s !== 'out') return false;
        }
        if (!q) return true;
        return r.name.toLowerCase().includes(q) || r.barcode.includes(q) || (r.category ?? '').toLowerCase().includes(q);
      })
      .slice(0, 30);
  }, [all, query, selected, category, statusFilter]);

  const submit = async () => {
    if (!selected) return;
    const session = getSession();
    setSaving(true);
    try {
      await enqueue('dispense', {
        id: `dsp_${nanoid(12)}`,
        barcode: selected.barcode,
        product_name: selected.name,
        qty,
        reason,
        taken_by: who.trim() || null,
        issued_at: Date.now(),
        performed_by: session?.guardId ?? null,
        performed_by_name: session?.guardName ?? null,
      });
      await adjustOnHand(selected.barcode, -qty);
      await flushOnce().catch(() => {});
      haptic.success();
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  if (!selected) {
    return (
      <View style={[styles.safe, { backgroundColor: palette.background }]}>
        <AppBar title={t('dispense')} subtitle={t('dispenseSub')} onBack={() => navigation.goBack()} />
        <View style={styles.search}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('search')}
            placeholderTextColor={palette.onSurfaceVariant}
            style={[
            styles.searchInput,
            {
              backgroundColor: palette.surfaceContainerLowest,
              borderColor: palette.outlineVariant,
              color: palette.onSurface,
            },
          ]}
            autoFocus
          />
        </View>
        <View style={styles.filterRow}>
          <FilterDropdown
            label={t('filterCategory')}
            options={categoryOptions}
            selected={category}
            onSelect={setCategory}
          />
          <FilterDropdown
            label={t('filterStatus')}
            options={STATUS_OPTIONS}
            selected={statusFilter}
            onSelect={setStatusFilter}
          />
        </View>
        {initialLoading && all.length === 0 ? (
          <View style={styles.list}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ marginBottom: spacing.sm }}>
                <Card tone="filled" padding="lg">
                  <Skeleton width="55%" height={18} />
                  <View style={{ height: 6 }} />
                  <Skeleton width="75%" height={14} />
                </Card>
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(r) => r.barcode}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            renderItem={({ item }) => (
              <Card tone="filled" padding="lg" onPress={() => setSelected(item)} style={{ backgroundColor: cardBg(item) }}>
                <View style={styles.pickerRow}>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium">{item.name}</Text>
                    <Text
                      variant="bodyMedium"
                      color={palette.onSurfaceVariant}
                      style={{ marginTop: 2 }}
                    >
                      {item.category ?? '—'}
                    </Text>
                  </View>
                  <Text variant="titleLarge" color={countColor(item)} style={{ fontWeight: '700' }}>
                    {item.on_hand}
                  </Text>
                </View>
              </Card>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text variant="bodyLarge" color={palette.onSurfaceVariant} style={{ textAlign: 'center' }}>
                  No items match.
                </Text>
              </View>
            }
          />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar
        title={t('dispense')}
        subtitle={selected.name}
        onBack={() => setSelected(null)}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.body}>
          <Card tone="elevated" padding="xl">
            <Text variant="labelLarge" color={palette.onSurfaceVariant}>
              PRODUCT
            </Text>
            <Text variant="headlineSmall" style={{ marginTop: spacing.xs }}>
              {selected.name}
            </Text>
            <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.xs }}>
              {selected.on_hand} {selected.unit ?? ''} {t('onHand')}
            </Text>
          </Card>

          <View style={styles.qtySection}>
            <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ textAlign: 'center' }}>
              {t('howMany').toUpperCase()}
            </Text>
            <QtyStepper value={qty} onChange={setQty} min={1} max={selected.on_hand || undefined} />
          </View>

          <View>
            <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ marginBottom: spacing.sm }}>
              {t('reason').toUpperCase()}
            </Text>
            <View style={styles.chipRow}>
              {REASONS.map((r) => (
                <Chip key={r} label={r} selected={r === reason} onPress={() => setReason(r)} />
              ))}
            </View>
          </View>

          <TextField
            label={t('whoTook')}
            value={who}
            onChangeText={setWho}
            placeholder={t('nameOptional')}
            returnKeyType="done"
          />
        </View>

        <View style={[styles.footer, { backgroundColor: palette.surface, borderTopColor: palette.outlineVariant }]}>
          <Button
            label={t('confirm')}
            onPress={submit}
            loading={saving}
            size="lg"
            fullWidth
            leadingIcon={<Check size={22} color={palette.onPrimary} strokeWidth={2.4} />}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  search: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  searchInput: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    fontSize: 17,
  },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  body: { flex: 1, padding: spacing.xl, gap: spacing.xl },
  qtySection: { gap: spacing.lg },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  empty: { padding: spacing.xxl },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
  },
});
