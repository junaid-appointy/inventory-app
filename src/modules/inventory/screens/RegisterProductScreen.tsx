import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { ScanLine } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  AppBar,
  Button,
  Chip,
  IconButton,
  radius,
  spacing,
  Text,
  TextField,
} from '../../../design';
import { SyncRefreshButton } from '../components/SyncRefreshButton';
import { learnBarcode, type CanonicalProduct } from '../../../db/catalog';
import { enqueue } from '../../../db/outbox';
import { upsertProduct } from '../../../db/products';
import { useT } from '../../../i18n';
import { StringKey } from '../../../i18n/strings';
import { useTheme } from '../../../theme';
import { RootStackParamList } from '../../../navigation/types';
import {
  flushOnce,
  getLastCatalogSync,
  syncCanonicalProducts,
} from '../../../sync/syncService';
import { haptic } from '../../../utils/haptics';
import { useCanonicalSuggest } from '../hooks/useCanonicalSuggest';
import { useKeyboardHeight } from '../../../hooks/useKeyboardHeight';

type Props = NativeStackScreenProps<RootStackParamList, 'RegisterProduct'>;

// The chip VALUE is the canonical string stored on the product; only the
// displayed label is translated. Values not in these maps (e.g. a unit/
// category inherited from a catalog match, or SI symbols like kg/ml that
// aren't translated) fall back to the raw value.
const CATEGORIES = ['Grocery', 'Cleaning', 'Office', 'Cafeteria', 'Other'];
const UNITS = ['pcs', 'kg', 'g', 'l', 'ml', 'pack'];
const CATEGORY_LABEL: Record<string, StringKey> = {
  Grocery: 'catGrocery',
  Cleaning: 'catCleaning',
  Office: 'catOffice',
  Cafeteria: 'catCafeteria',
  Other: 'catOther',
};
const UNIT_LABEL: Record<string, StringKey> = {
  pcs: 'unitPcs',
  pack: 'unitPackShort',
};

export function RegisterProductScreen({ route, navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const { barcode } = route.params;
  const kbHeight = useKeyboardHeight();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Grocery');
  const [unit, setUnit] = useState('pcs');
  const [packSize, setPackSize] = useState('');
  // dispense_mode is a per-SKU setting that decides whether qty is whole
  // packs (integer) or base units (decimal). Only offered when pack_size > 1
  // and the SKU is brand-new (catalog picks inherit the catalog's mode).
  const [divisible, setDivisible] = useState(false);
  // Track which canonical product was picked from the dropdown so save can
  // map the scanned barcode → existing product instead of creating a duplicate.
  const [pickedProductId, setPickedProductId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reached only when the scanned barcode is unmapped. Hide canonical
  // products that already have a barcode so the guard can't accidentally
  // map a second barcode to the same product (one-barcode-per-product).
  const { matches, suggestion, catalog, searching, reload } = useCanonicalSuggest(name, {
    excludeMapped: true,
  });

  // Force-refresh the catalog every time this screen is shown — otherwise
  // products created in the dashboard after the last periodic sync won't
  // show up here.
  const refresh = useCallback(async () => {
    await syncCanonicalProducts();
    await reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Allow only digits and a single decimal point in the pack-size input.
  const onPackSizeChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    setPackSize(parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned);
  };

  const parsedPackSize = (() => {
    const n = parseFloat(packSize);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  const acceptCatalog = (p: CanonicalProduct) => {
    haptic.tap();
    setName(p.canonical_name);
    if (p.category) setCategory(p.category);
    if (p.unit) setUnit(p.unit);
    if (p.pack_size != null && p.pack_size > 0) setPackSize(String(p.pack_size));
    setPickedProductId(p.product_id);
    setDropdownOpen(false);
  };

  // Any free-text edit invalidates the catalog mapping — at save time
  // we'll treat this as "create new product" instead of "map to existing".
  useEffect(() => {
    if (pickedProductId == null) return;
    const picked = catalog.find((p) => p.product_id === pickedProductId);
    if (!picked) return;
    if (picked.canonical_name !== name) setPickedProductId(null);
  }, [name, catalog, pickedProductId]);

  // If the picked product's category or unit isn't in the default chip
  // lists, surface them dynamically so the user can see what was applied.
  const visibleCategories = CATEGORIES.includes(category) ? CATEGORIES : [...CATEGORIES, category];
  const visibleUnits = UNITS.includes(unit) ? UNITS : [...UNITS, unit];

  const canSave = name.trim().length > 0 && !saving;

  const onSave = async () => {
    if (!canSave) {
      haptic.warn();
      return;
    }
    setSaving(true);
    try {
      const trimmedName = name.trim();
      if (pickedProductId) {
        // Map the scanned barcode to an existing canonical product.
        // The next scan auto-resolves to Receiving with no picker needed.
        await learnBarcode(barcode, pickedProductId, 'scan');
        await enqueue('learn_barcode', { barcode, product_id: pickedProductId }).catch(() => {});
        flushOnce().catch(() => {});
        haptic.success();
        navigation.push('Receiving', {
          barcode,
          productId: pickedProductId,
          productName: trimmedName,
          unit,
          packSize: parsedPackSize ?? undefined,
        });
      } else {
        // No catalog match — record a new local product. (Admin can
        // promote it to a canonical product later from the dashboard.)
        const dispenseMode: 'pack' | 'divisible' =
          divisible && parsedPackSize != null && parsedPackSize > 1 ? 'divisible' : 'pack';
        await upsertProduct({
          barcode,
          name: trimmedName,
          category,
          unit,
          pack_size: parsedPackSize,
          dispense_mode: dispenseMode,
        });
        await enqueue('product_registration', {
          barcode,
          name: trimmedName,
          category,
          unit,
          packSize: parsedPackSize,
          dispenseMode,
        });
        flushOnce().catch(() => {});
        haptic.success();
        navigation.push('Receiving', {
          barcode,
          packSize: parsedPackSize ?? undefined,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  // Subtitle is the scanned barcode — that's the primary identifier
  // for this screen and the guard expects to see it. We deliberately
  // do NOT surface background sync errors here: a transient backend
  // hiccup shouldn't make the field-app look broken when the local
  // catalog still works. Sync status lives on the refresh icon (red
  // dot when stale) and in the Sync queue screen.
  const syncStatus = getLastCatalogSync();
  const subtitle = barcode;
  const syncStale =
    syncStatus.error != null ||
    (syncStatus.remote > 0 && syncStatus.written !== syncStatus.remote);

  return (
    <View style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar
        title={t('newProduct')}
        subtitle={subtitle}
        onBack={() => navigation.goBack()}
        trailing={
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <SyncRefreshButton onPress={refresh} stale={syncStale} />
            <IconButton Icon={ScanLine} onPress={() => navigation.replace('Scanner')} />
          </View>
        }
      />
      {/*
        On iOS we use padding to lift the footer above the keyboard.
        On Android we rely on the system's android:windowSoftInputMode
        adjustResize (set in app.json) — wrapping with a KAV here was
        adding phantom bottom space when the keyboard was NOT shown.
      */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: spacing.lg + kbHeight }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="headlineMedium">{t('productName')}</Text>

          <View style={{ marginTop: spacing.lg }}>
            <TextField
              label={t('productName')}
              value={name}
              onChangeText={(v) => { setName(v); setDropdownOpen(true); }}
              onFocus={() => setDropdownOpen(true)}
              placeholder={t('productExample')}
              autoFocus
              returnKeyType="done"
              clearable
            />

            {dropdownOpen && searching && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.xs,
                  marginTop: spacing.xs,
                  paddingHorizontal: spacing.xs,
                }}
              >
                <ActivityIndicator size="small" color={palette.primary} />
                <Text variant="labelMedium" color={palette.onSurfaceVariant}>
                  {t('searchingCatalog')}
                </Text>
              </View>
            )}

            {dropdownOpen && matches.length > 0 && (
              <View
                style={{
                  marginTop: spacing.xs,
                  borderWidth: 1,
                  borderColor: palette.outlineVariant,
                  borderRadius: radius.md,
                  backgroundColor: palette.surface,
                  overflow: 'hidden',
                  maxHeight: 280,
                }}
              >
                <ScrollView
                  key={matches.length}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingTop: spacing.xs }}
                >
                  {matches.slice(0, 50).map((p, idx) => (
                    <React.Fragment key={p.product_id}>
                      {idx > 0 && (
                        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.outlineVariant }} />
                      )}
                      <Pressable
                        onPress={() => acceptCatalog(p)}
                        android_ripple={{ color: palette.surfaceContainerLowest }}
                        style={({ pressed }) => [{
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.sm,
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: spacing.md,
                          backgroundColor: pressed ? palette.surfaceContainerLowest : 'transparent',
                        }]}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text variant="bodyLarge" numberOfLines={1}>{p.canonical_name}</Text>
                          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 2, flexWrap: 'wrap' }}>
                            {p.category ? (
                              <Text variant="labelMedium" color={palette.onSurfaceVariant}>{p.category}</Text>
                            ) : null}
                            {p.hsn_code ? (
                              <Text variant="labelMedium" color={palette.onSurfaceVariant}>HSN {p.hsn_code}</Text>
                            ) : null}
                          </View>
                        </View>
                        <Text variant="labelLarge" color={palette.onSurface}>
                          {p.pack_size} {p.unit}
                        </Text>
                      </Pressable>
                    </React.Fragment>
                  ))}
                </ScrollView>
              </View>
            )}

            {dropdownOpen && matches.length === 0 && suggestion && (
              <Pressable onPress={() => acceptCatalog(suggestion)}>
                <View
                  style={{
                    marginTop: spacing.sm,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                    borderWidth: 1,
                    borderColor: palette.outlineVariant,
                    borderRadius: 999,
                    alignSelf: 'flex-start',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.xs,
                  }}
                >
                  <Text variant="labelMedium" color={palette.onSurfaceVariant}>{t('didYouMean')}</Text>
                  <Text variant="labelLarge" color={palette.onSurface}>{suggestion.canonical_name}</Text>
                  <Text variant="labelMedium" color={palette.onSurfaceVariant}>
                    · {suggestion.pack_size} {suggestion.unit}
                  </Text>
                </View>
              </Pressable>
            )}

            {pickedProductId && (
              <View style={{ marginTop: spacing.sm }}>
                <Text variant="bodyMedium" color={palette.primary}>
                  {t('barcodeWillBeLinked')} {name}
                </Text>
              </View>
            )}
          </View>

          {/* When the row is mapped to a catalog product, category /
              unit / pack-size belong to that product's definition and
              cannot be edited here. Edits to the catalog are done from
              the admin dashboard. We still RENDER the fields so the
              guard can see what the picked product carries. */}
          <View style={{ marginTop: spacing.xl, opacity: pickedProductId ? 0.6 : 1 }}>
            <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ marginBottom: spacing.sm }}>
              {t('category').toUpperCase()}
            </Text>
            <View style={styles.chipRow} pointerEvents={pickedProductId ? 'none' : 'auto'}>
              {visibleCategories.map((c) => (
                <Chip
                  key={c}
                  label={CATEGORY_LABEL[c] ? t(CATEGORY_LABEL[c]) : c}
                  selected={c === category}
                  onPress={() => setCategory(c)}
                />
              ))}
            </View>
          </View>

          <View style={{ marginTop: spacing.xl, opacity: pickedProductId ? 0.6 : 1 }}>
            <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ marginBottom: spacing.sm }}>
              {t('unit').toUpperCase()}
            </Text>
            <View style={styles.chipRow} pointerEvents={pickedProductId ? 'none' : 'auto'}>
              {visibleUnits.map((u) => (
                <Chip
                  key={u}
                  label={UNIT_LABEL[u] ? t(UNIT_LABEL[u]) : u}
                  selected={u === unit}
                  onPress={() => setUnit(u)}
                />
              ))}
            </View>
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <TextField
              label={t('unitValue')}
              value={packSize}
              onChangeText={onPackSizeChange}
              placeholder={t('unitValueHint')}
              keyboardType="decimal-pad"
              returnKeyType="done"
              editable={!pickedProductId}
              style={pickedProductId ? { opacity: 0.6 } : undefined}
            />
          </View>

          {/* Divisible toggle — only when registering a new product (not a
              catalog mapping, which inherits its mode) AND pack_size > 1.
              Below pack_size=1 there's no meaningful "subdivide one pack"
              to do, so we keep the UI clean. */}
          {!pickedProductId && parsedPackSize != null && parsedPackSize > 1 ? (
            <View style={{ marginTop: spacing.xl }}>
              <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ marginBottom: spacing.sm }}>
                {t('trackingMode').toUpperCase()}
              </Text>
              <View style={styles.chipRow}>
                <Chip
                  label={t('wholePacks', { size: parsedPackSize, unit })}
                  selected={!divisible}
                  onPress={() => setDivisible(false)}
                />
                <Chip
                  label={t('divisibleMode', { unit })}
                  selected={divisible}
                  onPress={() => setDivisible(true)}
                />
              </View>
              <Text
                variant="bodyMedium"
                color={palette.onSurfaceVariant}
                style={{ marginTop: spacing.sm }}
              >
                {divisible
                  ? t('dispenseFractionalHint', { unit })
                  : t('dispenseWholeHint')}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: palette.surface, borderTopColor: palette.outlineVariant }]}>
          <Button
            label={pickedProductId ? t('linkAndContinue') : t('saveAndContinue')}
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
  safe: { flex: 1 },
  // padding: just the standard screen padding; the sticky footer below
  // provides its own spacing. Earlier `paddingBottom: xxxl` was leaving
  // a phantom dead zone above the buttons.
  scroll: { padding: spacing.xl, paddingBottom: spacing.lg },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
  },
});
