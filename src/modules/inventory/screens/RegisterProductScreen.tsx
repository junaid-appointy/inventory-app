import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScanLine } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppBar,
  Button,
  Chip,
  IconButton,
  palette,
  radius,
  spacing,
  Text,
  TextField,
} from '../../../design';
import { enqueue } from '../../../db/outbox';
import { upsertProduct } from '../../../db/products';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { api } from '../../../sync/api';
import { flushOnce } from '../../../sync/syncService';
import { haptic } from '../../../utils/haptics';
import type { KnownProduct } from '../../../db/catalog';
import { useCatalogSuggest } from '../hooks/useCatalogSuggest';

type Props = NativeStackScreenProps<RootStackParamList, 'RegisterProduct'>;

const CATEGORIES = ['Grocery', 'Cleaning', 'Office', 'Cafeteria', 'Other'];
const UNITS = ['Piece', 'Kg', 'Litre', 'Pack', 'Box'];

export function RegisterProductScreen({ route, navigation }: Props) {
  const t = useT();
  const { barcode } = route.params;
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Grocery');
  const [unit, setUnit] = useState('Piece');
  const [saving, setSaving] = useState(false);
  const canSave = name.trim().length > 0 && !saving;
  const { suggestions } = useCatalogSuggest(name);

  const acceptSuggestion = (s: KnownProduct) => {
    haptic.tap();
    setName(s.name);
    if (s.category && CATEGORIES.includes(s.category)) setCategory(s.category);
    if (s.unit && UNITS.includes(s.unit)) setUnit(s.unit);
  };

  // Layer 3: server-side LLM normalization. Debounced so we don't fire on
  // every keystroke — only after the user stops typing for ~350ms. Skipped
  // if there are local fuzzy matches (cheaper) or the input is too short.
  const [normalized, setNormalized] = useState<{ canonical: string } | null>(null);
  const [normalizing, setNormalizing] = useState(false);
  const normalizeReq = useRef(0);
  useEffect(() => {
    const trimmed = name.trim();
    if (trimmed.length < 3 || suggestions.length > 0) {
      setNormalized(null);
      setNormalizing(false);
      return;
    }
    const reqId = ++normalizeReq.current;
    const timer = setTimeout(async () => {
      // Only show the "Thinking…" pill if the fetch is still the latest.
      if (reqId !== normalizeReq.current) return;
      setNormalizing(true);
      try {
        const result = await api.fetch.normalizeName(trimmed);
        if (reqId !== normalizeReq.current) return;
        if (
          result.confidence >= 0.7 &&
          result.canonical.toLowerCase() !== trimmed.toLowerCase()
        ) {
          setNormalized({ canonical: result.canonical });
        } else {
          setNormalized(null);
        }
      } catch {
        if (reqId === normalizeReq.current) setNormalized(null);
      } finally {
        if (reqId === normalizeReq.current) setNormalizing(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [name, suggestions.length]);

  const acceptNormalized = () => {
    if (!normalized) return;
    haptic.tap();
    setName(normalized.canonical);
    setNormalized(null);
  };

  const onSave = async () => {
    if (!canSave) {
      haptic.warn();
      return;
    }
    setSaving(true);
    try {
      await upsertProduct({ barcode, name: name.trim(), category, unit });
      await enqueue('product_registration', { barcode, name: name.trim(), category, unit });
      flushOnce().catch(() => {});
      haptic.success();
      navigation.replace('Receiving', { barcode });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.safe}>
      <AppBar
        title={t('newProduct')}
        subtitle={barcode}
        onBack={() => navigation.goBack()}
        trailing={<IconButton Icon={ScanLine} onPress={() => navigation.replace('Scanner')} />}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text variant="headlineMedium">{t('productName')}</Text>
          <Text variant="bodyLarge" color={palette.onSurfaceVariant} style={{ marginTop: spacing.xs }}>
            Tell us once. We'll remember it next time you scan it.
          </Text>

          <View style={{ marginTop: spacing.xl }}>
            <TextField
              label={t('productName')}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Tata Salt 1kg"
              autoFocus
              returnKeyType="done"
            />
            {suggestions.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.suggestRow}
                keyboardShouldPersistTaps="handled"
              >
                <Text variant="labelMedium" color={palette.onSurfaceVariant} style={styles.suggestLabel}>
                  Did you mean
                </Text>
                {suggestions.map((s) => (
                  <Pressable
                    key={s.barcode}
                    onPress={() => acceptSuggestion(s)}
                    android_ripple={{ color: palette.outlineVariant }}
                    style={[styles.suggestChip, { backgroundColor: palette.primaryContainer }]}
                  >
                    <Text variant="labelLarge" color={palette.onPrimaryContainer}>
                      {s.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {suggestions.length === 0 && normalized && (
              <View style={styles.suggestRow}>
                <Text variant="labelMedium" color={palette.onSurfaceVariant} style={styles.suggestLabel}>
                  Did you mean
                </Text>
                <Pressable
                  onPress={acceptNormalized}
                  android_ripple={{ color: palette.outlineVariant }}
                  style={[styles.suggestChip, { backgroundColor: palette.primaryContainer }]}
                >
                  <Text variant="labelLarge" color={palette.onPrimaryContainer}>
                    {normalized.canonical}
                  </Text>
                </Pressable>
              </View>
            )}
            {suggestions.length === 0 && !normalized && normalizing && (
              <View style={styles.suggestRow}>
                <ActivityIndicator color={palette.primary} size="small" />
                <Text variant="labelMedium" color={palette.onSurfaceVariant} style={styles.suggestLabel}>
                  Checking spelling…
                </Text>
              </View>
            )}
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ marginBottom: spacing.sm }}>
              {t('category').toUpperCase()}
            </Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((c) => (
                <Chip key={c} label={c} selected={c === category} onPress={() => setCategory(c)} />
              ))}
            </View>
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ marginBottom: spacing.sm }}>
              {t('unit').toUpperCase()}
            </Text>
            <View style={styles.chipRow}>
              {UNITS.map((u) => (
                <Chip key={u} label={u} selected={u === unit} onPress={() => setUnit(u)} />
              ))}
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={t('saveAndContinue')}
            onPress={onSave}
            disabled={!canSave}
            loading={saving}
            size="lg"
            fullWidth
          />
          <Button
            label={t('cancel')}
            variant="text"
            onPress={() => navigation.popToTop()}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingRight: spacing.sm,
  },
  suggestLabel: { marginRight: spacing.xs },
  suggestChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  footer: {
    padding: spacing.xl,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.outlineVariant,
  },
});
