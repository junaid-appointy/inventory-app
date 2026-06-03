import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RefreshCw, ScanLine } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
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
import { learnBarcode, type CanonicalProduct } from '../../../db/catalog';
import { enqueue } from '../../../db/outbox';
import { upsertProduct } from '../../../db/products';
import { useT } from '../../../i18n';
import { useTheme } from '../../../theme';
import { RootStackParamList } from '../../../navigation/types';
import {
  flushOnce,
  getLastCatalogSync,
  syncCanonicalProducts,
} from '../../../sync/syncService';
import { haptic } from '../../../utils/haptics';
import { useCanonicalSuggest } from '../hooks/useCanonicalSuggest';

type Props = NativeStackScreenProps<RootStackParamList, 'RegisterProduct'>;

const CATEGORIES = ['Grocery', 'Cleaning', 'Office', 'Cafeteria', 'Other'];
const UNITS = ['pcs', 'kg', 'g', 'l', 'ml', 'pack'];

export function RegisterProductScreen({ route, navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const { barcode } = route.params;

  const [name, setName] = useState('');
  const [category, setCategory] = useState('Grocery');
  const [unit, setUnit] = useState('pcs');
  const [packSize, setPackSize] = useState('');
  // Track which canonical product was picked from the dropdown so save can
  // map the scanned barcode → existing product instead of creating a duplicate.
  const [pickedProductId, setPickedProductId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { matches, suggestion, catalog, reload } = useCanonicalSuggest(name);

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
        navigation.replace('Receiving', {
          barcode,
          productId: pickedProductId,
          productName: trimmedName,
          unit,
          packSize: parsedPackSize ?? undefined,
        });
      } else {
        // No catalog match — record a new local product. (Admin can
        // promote it to a canonical product later from the dashboard.)
        await upsertProduct({ barcode, name: trimmedName, category, unit, pack_size: parsedPackSize });
        await enqueue('product_registration', {
          barcode,
          name: trimmedName,
          category,
          unit,
          packSize: parsedPackSize,
        });
        flushOnce().catch(() => {});
        haptic.success();
        navigation.replace('Receiving', {
          barcode,
          packSize: parsedPackSize ?? undefined,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const syncStatus = getLastCatalogSync();
  const subtitle = (() => {
    if (syncStatus.remote > 0 && syncStatus.written !== syncStatus.remote) {
      return `${catalog.length} cached · sync ${syncStatus.written}/${syncStatus.remote}`;
    }
    if (syncStatus.error) return `${catalog.length} cached · sync error`;
    return barcode;
  })();

  return (
    <View style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar
        title={t('newProduct')}
        subtitle={subtitle}
        onBack={() => navigation.goBack()}
        trailing={
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <IconButton Icon={RefreshCw} onPress={() => void refresh()} />
            <IconButton Icon={ScanLine} onPress={() => navigation.replace('Scanner')} />
          </View>
        }
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text variant="headlineMedium">{t('productName')}</Text>
          <Text variant="bodyLarge" color={palette.onSurfaceVariant} style={{ marginTop: spacing.xs }}>
            Start typing — we'll match it against the {catalog.length}-item catalog. Pick one to auto-fill
            category, unit and pack size.
          </Text>

          <View style={{ marginTop: spacing.xl }}>
            <TextField
              label={t('productName')}
              value={name}
              onChangeText={(v) => { setName(v); setDropdownOpen(true); }}
              onFocus={() => setDropdownOpen(true)}
              placeholder={t('productExample')}
              autoFocus
              returnKeyType="done"
            />

            {dropdownOpen && matches.length > 0 && (
              <ScrollView
                style={{
                  marginTop: spacing.xs,
                  borderWidth: 1,
                  borderColor: palette.outlineVariant,
                  borderRadius: radius.md,
                  backgroundColor: palette.surface,
                  maxHeight: 280,
                }}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {matches.map((p, idx) => (
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
                  <Text variant="labelMedium" color={palette.onSurfaceVariant}>Did you mean:</Text>
                  <Text variant="labelLarge" color={palette.onSurface}>{suggestion.canonical_name}</Text>
                  <Text variant="labelMedium" color={palette.onSurfaceVariant}>
                    · {suggestion.pack_size} {suggestion.unit}
                  </Text>
                </View>
              </Pressable>
            )}

            {pickedProductId && (
              <View style={{ marginTop: spacing.sm }}>
                <Text variant="labelMedium" color={palette.primary}>
                  ✓ Mapped to catalog — saving will link this barcode.
                </Text>
              </View>
            )}
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ marginBottom: spacing.sm }}>
              {t('category').toUpperCase()}
            </Text>
            <View style={styles.chipRow}>
              {visibleCategories.map((c) => (
                <Chip key={c} label={c} selected={c === category} onPress={() => setCategory(c)} />
              ))}
            </View>
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ marginBottom: spacing.sm }}>
              {t('unit').toUpperCase()}
            </Text>
            <View style={styles.chipRow}>
              {visibleUnits.map((u) => (
                <Chip key={u} label={u} selected={u === unit} onPress={() => setUnit(u)} />
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
            />
          </View>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: palette.surface, borderTopColor: palette.outlineVariant }]}>
          <Button
            label={pickedProductId ? 'Link to catalog & continue' : t('saveAndContinue')}
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
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
  },
});
