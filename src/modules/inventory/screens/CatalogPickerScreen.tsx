import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Camera, Search, X } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View, KeyboardAvoidingView, Platform } from 'react-native';
import {
  AppBar,
  radius,
  Skeleton,
  spacing,
  Text,
} from '../../../design';
import { SyncRefreshButton } from '../components/SyncRefreshButton';
import {
  CanonicalProduct,
  findBarcodeForProduct,
  learnBarcode,
  listCanonicalProducts,
} from '../../../db/catalog';
import { enqueue } from '../../../db/outbox';
import { getDb } from '../../../db/database';
import { RootStackParamList } from '../../../navigation/types';
import { getLastCatalogSync, syncCanonicalProducts, syncOrders } from '../../../sync/syncService';
import { useTheme } from '../../../theme';
import { useT } from '../../../i18n';
import { getLastSyncTime, setLastSyncTime, isCacheStale } from '../../../sync/cacheTime';

type Props = NativeStackScreenProps<RootStackParamList, 'CatalogPicker'>;

type OpenOrderItem = {
  product_id: string;
  expected_qty: number;
  received_qty: number;
};

/** Bigram (Dice coefficient) similarity — used to surface a single
 *  "Did you mean…" pill when nothing matched as a substring. Catches
 *  typos like "wagh bkri" → "wagh bakri" without flooding the user
 *  with low-quality matches. */
function similarity(a: string, b: string): number {
  const la = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const lb = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (la === lb) return 1;
  if (la.length < 2 || lb.length < 2) return 0;
  const bg = (s: string) => {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  };
  const A = bg(la);
  const B = bg(lb);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size);
}

export function CatalogPickerScreen({ navigation, route }: Props) {
  const { palette } = useTheme();
  const t = useT();
  const incomingBarcode = route.params?.barcode;
  const [products, setProducts] = useState<CanonicalProduct[]>([]);
  const [openItemMap, setOpenItemMap] = useState<Record<string, OpenOrderItem>>({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const loadFromCache = useCallback(async () => {
    const all = await listCanonicalProducts();
    setProducts(all);

    const db = await getDb();
    const rows = await db.getAllAsync<OpenOrderItem>(
      `SELECT oi.product_id, oi.expected_qty, oi.received_qty
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status = 'open' AND oi.product_id IS NOT NULL`,
    );
    const map: Record<string, OpenOrderItem> = {};
    for (const r of rows) map[r.product_id] = r;
    setOpenItemMap(map);
    setLoading(false);
  }, []);

  const refresh = useCallback(async (forceRefresh = false) => {
    const lastSync = await getLastSyncTime('catalog');
    const stale = isCacheStale(lastSync);

    if (forceRefresh || stale) {
      await Promise.all([syncCanonicalProducts(), syncOrders()]);
      await setLastSyncTime('catalog');
    }

    await loadFromCache();
  }, [loadFromCache]);

  useFocusEffect(
    useCallback(() => {
      void refresh(false);
    }, [refresh]),
  );

  /** Build the dropdown list:
   *   1. With no query — show items expected on open orders first, then
   *      the rest, capped at MAX_VISIBLE.
   *   2. With a query — rank by match strength (exact > prefix >
   *      substring > category/HSN substring), capped at MAX_VISIBLE.
   *   3. Always compute the best fuzzy near-miss separately for the
   *      "Did you mean…" pill. */
  const { visible, suggestion } = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // No query — surface every catalog item. Items expected on open
      // orders float to the top so the most likely picks are one tap
      // away; the rest follow in alphabetical order.
      const expected: CanonicalProduct[] = [];
      const others: CanonicalProduct[] = [];
      for (const p of products) {
        (openItemMap[p.product_id] ? expected : others).push(p);
      }
      others.sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
      return {
        visible: [...expected, ...others],
        suggestion: null as CanonicalProduct | null,
      };
    }

    type Scored = { p: CanonicalProduct; score: number };
    const scored: Scored[] = products.map((p) => {
      const name = p.canonical_name.toLowerCase();
      let score = 0;
      if (name === q) score = 3;
      else if (name.startsWith(q)) score = 2;
      else if (name.includes(q)) score = 1;
      else if ((p.category ?? '').toLowerCase().includes(q)) score = 0.5;
      else if ((p.hsn_code ?? '').toLowerCase().includes(q)) score = 0.5;
      return { p, score };
    });

    const exactMatches = scored.filter((x) => x.score > 0);
    exactMatches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aExpected = openItemMap[a.p.product_id] ? 1 : 0;
      const bExpected = openItemMap[b.p.product_id] ? 1 : 0;
      if (bExpected !== aExpected) return bExpected - aExpected;
      return a.p.canonical_name.localeCompare(b.p.canonical_name);
    });

    let suggestion: CanonicalProduct | null = null;
    if (exactMatches.length === 0) {
      let best: CanonicalProduct | null = null;
      let bestScore = 0;
      for (const p of products) {
        const s = similarity(query, p.canonical_name);
        if (s > bestScore) { bestScore = s; best = p; }
      }
      if (best && bestScore >= 0.35) suggestion = best;
    }

    return {
      visible: exactMatches.map((x) => x.p),
      suggestion,
    };
  }, [products, openItemMap, query]);

  async function pick(product: CanonicalProduct) {
    // Learn barcode → product the moment the guard picks, so a future
    // scan auto-resolves even if they cancel the receipt downstream.
    if (incomingBarcode) {
      try {
        await learnBarcode(incomingBarcode, product.product_id, 'scan');
        await enqueue('learn_barcode', {
          barcode: incomingBarcode,
          product_id: product.product_id,
        }).catch(() => {});
      } catch {
        // Non-fatal: the receipt flow has its own learning step.
      }
    }
    // No-barcode pick path: if this product already has a real barcode
    // learned, reuse it so the receipt rolls into the same stock row and
    // the user sees the actual barcode (not `catalog_…`). Only fall back
    // to the synthetic id when nothing is mapped yet — the format is
    // stable per product_id so a later real-barcode learn keeps history
    // and stock aligned.
    let barcode = incomingBarcode;
    if (!barcode) {
      const existing = await findBarcodeForProduct(product.product_id);
      barcode = existing ?? `catalog_${product.product_id}`;
    }
    navigation.push('Receiving', {
      barcode,
      productId: product.product_id,
      productName: product.canonical_name,
      unit: product.unit,
      packSize: product.pack_size,
    });
  }

  return (
    <View style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar
          title={t('pickProduct')}
          subtitle={`${products.length} ${products.length === 1 ? t('itemInCatalog') : t('itemsInCatalog')}`}
          onBack={() => navigation.goBack()}
          trailing={(() => {
            const s = getLastCatalogSync();
            const stale =
              s.error != null ||
              (s.remote > 0 && s.written !== s.remote);
            return <SyncRefreshButton onPress={refresh} stale={stale} />;
          })()}
        />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
      <View style={{ padding: spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.md,
            borderRadius: radius.md,
            backgroundColor: palette.surfaceContainerLowest,
            borderWidth: 1,
            borderColor: palette.outlineVariant,
          }}
        >
          <Search size={18} color={palette.onSurfaceVariant} strokeWidth={2.2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('searchPlaceholder')}
            placeholderTextColor={palette.onSurfaceVariant}
            style={{ flex: 1, paddingVertical: spacing.md, color: palette.onSurface, fontSize: 15 }}
            autoCorrect={false}
            autoCapitalize="none"
            autoFocus
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <X size={18} color={palette.onSurfaceVariant} strokeWidth={2.2} />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: spacing.md, gap: spacing.sm }}>
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </View>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingBottom: spacing.xl }}>
          {/* Dropdown panel: single bordered surface, internally scrollable */}
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: palette.outlineVariant,
              borderRadius: radius.md,
              backgroundColor: palette.surface,
              overflow: 'hidden',
            }}
          >
            <FlatList
              data={visible}
              keyExtractor={(p) => p.product_id}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={() => (
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.outlineVariant }} />
              )}
              renderItem={({ item: p }) => {
                const oi = openItemMap[p.product_id];
                return (
                  <Pressable
                    android_ripple={{ color: palette.surfaceContainerLowest }}
                    onPress={() => { void pick(p); }}
                    style={({ pressed }) => [
                      {
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.sm,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: spacing.md,
                        backgroundColor: pressed ? palette.surfaceContainerLowest : 'transparent',
                      },
                    ]}
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
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="labelLarge" color={palette.onSurface}>
                        {p.pack_size} {p.unit}
                      </Text>
                      {oi && (
                        <Text variant="labelMedium" color={palette.onSurfaceVariant}>
                          {oi.received_qty}/{oi.expected_qty}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={{ padding: spacing.lg, alignItems: 'center' }}>
                  <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ textAlign: 'center' }}>
                    {t('noExactMatch')}
                  </Text>
                </View>
              }
            />
          </View>

          {/* Footer: one closest-match pill + photo escape hatch */}
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {suggestion && (
              <Pressable onPress={() => { void pick(suggestion); }}>
                <View
                  style={{
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
            <Pressable onPress={() => navigation.goBack()}>
              <View
                style={{
                  padding: spacing.md,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: palette.outlineVariant,
                  borderRadius: radius.md,
                }}
              >
                <Camera size={18} color={palette.onSurfaceVariant} strokeWidth={2.2} />
                <Text variant="labelLarge" color={palette.onSurfaceVariant}>
                  {t('notInList')}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
});
