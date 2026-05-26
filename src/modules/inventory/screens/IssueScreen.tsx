import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { nanoid } from 'nanoid/non-secure';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  AppBar,
  Button,
  Card,
  Chip,
  palette,
  radius,
  spacing,
  Text,
  TextField,
} from '../../../design';
import { enqueue } from '../../../db/outbox';
import { adjustOnHand, findStock, listStock, StockRow } from '../../../db/stock';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { flushOnce } from '../../../sync/syncService';
import { haptic } from '../../../utils/haptics';

type Props = NativeStackScreenProps<RootStackParamList, 'Issue'>;

const REASONS = ['Office use', 'Pantry', 'Cleaning', 'Maintenance', 'Other'];

export function IssueScreen({ route, navigation }: Props) {
  const t = useT();
  const initialBarcode = route.params?.barcode;
  const [selected, setSelected] = useState<StockRow | null>(null);
  const [all, setAll] = useState<StockRow[]>([]);
  const [query, setQuery] = useState('');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState(REASONS[0]);
  const [who, setWho] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listStock().then(setAll);
  }, []);

  useEffect(() => {
    if (initialBarcode) {
      findStock(initialBarcode).then((r) => r && setSelected(r));
    }
  }, [initialBarcode]);

  const results = useMemo(() => {
    if (selected) return [];
    const q = query.trim().toLowerCase();
    if (!q) return all.slice(0, 25);
    return all
      .filter((r) => r.name.toLowerCase().includes(q) || r.barcode.includes(q))
      .slice(0, 25);
  }, [all, query, selected]);

  const bump = useCallback((d: number) => {
    haptic.tap();
    setQty((v) => Math.max(1, v + d));
  }, []);

  const submit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await enqueue('issue', {
        id: `iss_${nanoid(12)}`,
        barcode: selected.barcode,
        product_name: selected.name,
        qty,
        reason,
        taken_by: who.trim() || null,
        issued_at: Date.now(),
      });
      await adjustOnHand(selected.barcode, -qty);
      flushOnce().catch(() => {});
      haptic.success();
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  if (!selected) {
    return (
      <View style={styles.safe}>
        <AppBar title={t('issue')} subtitle={t('issueSub')} onBack={() => navigation.goBack()} />
        <View style={styles.search}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('search')}
            placeholderTextColor={palette.onSurfaceVariant}
            style={styles.searchInput}
            autoFocus
          />
        </View>
        <FlatList
          data={results}
          keyExtractor={(r) => r.barcode}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <Card tone="filled" padding="lg" onPress={() => setSelected(item)}>
              <Text variant="titleMedium">{item.name}</Text>
              <Text
                variant="bodyMedium"
                color={palette.onSurfaceVariant}
                style={{ marginTop: 2 }}
              >
                {item.category ?? '—'} · {item.on_hand} {item.unit ?? ''} {t('onHand')}
              </Text>
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
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <AppBar
        title={t('issue')}
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
            <View style={styles.stepperRow}>
              <Stepper icon="−" onPress={() => bump(-1)} />
              <Text variant="displayLarge" style={styles.qtyNum}>{qty}</Text>
              <Stepper icon="+" onPress={() => bump(1)} />
            </View>
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
            placeholder="Name (optional)"
            returnKeyType="done"
          />
        </View>

        <View style={styles.footer}>
          <Button
            label={t('confirm')}
            onPress={submit}
            loading={saving}
            size="lg"
            fullWidth
            leadingIcon={
              <Text variant="titleLarge" color={palette.onPrimary}>✓</Text>
            }
          />
        </View>
      </KeyboardAvoidingView>
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
      <Text variant="displayMedium" color={palette.onPrimary}>{icon}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  search: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  searchInput: {
    backgroundColor: palette.surfaceContainerLowest,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: palette.outlineVariant,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    color: palette.onSurface,
    fontSize: 17,
  },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  body: { flex: 1, padding: spacing.xl, gap: spacing.xl },
  qtySection: { gap: spacing.lg },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  empty: { padding: spacing.xxl },
  footer: {
    padding: spacing.xl,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.outlineVariant,
  },
});
