import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check, type LucideIcon } from 'lucide-react-native';
import { nanoid } from 'nanoid/non-secure';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AmountStepper } from '../../../components/AmountStepper';
import { PackTile } from '../../../components/PackTile';
import { AppBar, Button, IconBadge, spacing, Text } from '../../../design';
import { getSession } from '../../../auth/session';
import { correctStockLocal, findStock, getNearestExpiry, StockRow } from '../../../db/stock';
import { listLots, replaceLotsLocal } from '../../../db/lots';
import { enqueue } from '../../../db/outbox';
import { useT } from '../../../i18n';
import { useCan } from '../../../auth';
import { NoPermission } from '../../../components/NoPermission';
import { useTheme } from '../../../theme';
import { RootStackParamList } from '../../../navigation/types';
import { api, ApiError } from '../../../sync/api';
import { flushOnce } from '../../../sync/syncService';
import { haptic } from '../../../utils/haptics';
import { useKeyboardHeight } from '../../../hooks/useKeyboardHeight';
import { formatAmount, formatSmall, productShape, smallPerPack, smallStep, smallUnit } from '../../../units';
import type { Batch } from '../components/BatchEditor';
import { ExpiryGroups } from '../components/ExpiryGroups';
import { PackShelf, SingleShelf } from '../components/Shelf';
import { categoryIcon } from '../categoryIcon';
import { joinLots, lotsKey, splitLots, type Lot } from '../countMath';

type Props = NativeStackScreenProps<RootStackParamList, 'EditStock'>;


/**
 * Correct count: a STOCKTAKE ("I counted the shelf and there is this
 * much"). A count is a fact about the physical world, so it always applies;
 * there is deliberately no conflict state (see
 * Planning-docs/inventory_conflict_free_sync_design.md).
 *
 * People count what they can see: full packs (per expiry date), then the
 * one open pack in exact kg + grams or pieces. Bag pictures only pre-fill
 * the open-pack amount; the saved number is always exact. On save the
 * open pack is added back to the dated batch it came from, so expiry
 * dates are never lost.
 */
type VerifyStatus = 'loading' | 'ready';

const EPS = 1e-9;

export function EditStockScreen({ route, navigation }: Props) {
  const t = useT();
  const can = useCan();
  const { palette } = useTheme();
  const kbHeight = useKeyboardHeight();
  const { barcode } = route.params;

  const [row, setRow] = useState<StockRow | null>(null);
  const [originalQty, setOriginalQty] = useState<number>(0);
  const [originalExpiry, setOriginalExpiry] = useState<string | null>(null);
  const [originalLots, setOriginalLots] = useState<Lot[]>([]);
  const [full, setFull] = useState<Batch[]>([]);
  const [openSmall, setOpenSmall] = useState(0);
  const [openExpiry, setOpenExpiry] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>('loading');

  /** 'remote' wins over 'local' and is never downgraded (the server's lot breakdown is the real one). */
  const seedSource = useRef<'none' | 'local' | 'remote'>('none');
  /** Set once the person edits anything, so a late server reply can't wipe what they typed. */
  const userTouched = useRef(false);

  const shape = row ? productShape(row.pack_size, row.unit) : 'single';
  const perPack = row ? smallPerPack(row.pack_size, row.unit) : 1;
  const countsOpen = shape !== 'single';

  const applySeed = (lots: Lot[], r: StockRow, source: 'local' | 'remote', qtyRef: number) => {
    seedSource.current = source;
    const pp = smallPerPack(r.pack_size, r.unit);
    const split = splitLots(lots, pp, productShape(r.pack_size, r.unit) !== 'single');
    setOriginalLots(lots);
    setFull(split.full);
    setOpenSmall(split.openSmall);
    setOpenExpiry(split.openExpiry);
    setOriginalQty(qtyRef);
    setOriginalExpiry(lots.map((l) => l.expiry).filter((e): e is string => !!e).sort()[0] ?? null);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await findStock(barcode);
      const exp = await getNearestExpiry(barcode);
      const lots = await listLots(barcode);
      if (cancelled || !r) return;
      setRow(r);
      setVerifyStatus((s) => (s === 'loading' ? 'ready' : s));
      if (seedSource.current === 'remote') return;
      // No lots yet (legacy row): one placeholder lot with the cached total.
      const seed: Lot[] = lots.length > 0
        ? lots.map((l) => ({ expiry: l.expiry_date, qty: Number(l.qty) }))
        : [{ expiry: exp, qty: r.on_hand || 0 }];
      applySeed(seed, r, 'local', r.on_hand);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcode]);

  // Fresh lot breakdown from the server, independent of the local read. A
  // failure never blocks the count: the shelf stays countable offline.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    (async () => {
      try {
        const remote = await api.fetch.stockOne(barcode);
        const r = await findStock(barcode);
        if (cancelled || !r) return;
        // Correcting REPLACES the lots, so seed from the server's real dated
        // batches rather than a cache that might have none.
        const remoteLots = (remote.lots ?? []).map((l) => ({ expiry: l.expiry_date, qty: Number(l.qty) }));
        if (remoteLots.length > 0 && !userTouched.current) applySeed(remoteLots, r, 'remote', Number(remote.on_hand));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return;
      } finally {
        clearTimeout(timer);
        if (!cancelled) setVerifyStatus('ready');
      }
    })();
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcode]);

  const nextLots = useMemo(() => joinLots(full, countsOpen ? openSmall : 0, openExpiry, perPack), [full, openSmall, openExpiry, perPack, countsOpen]);
  const total = useMemo(() => nextLots.reduce((s, l) => s + l.qty, 0), [nextLots]);
  const changed = !!row && lotsKey(nextLots) !== lotsKey(originalLots);
  const diff = total - originalQty;

  const touch = () => { userTouched.current = true; };

  const submit = async () => {
    if (!row || !changed) return;
    const session = getSession();
    setSaving(true);
    try {
      const nearest = nextLots.map((l) => l.expiry).filter((e): e is string => !!e).sort()[0] ?? null;
      await correctStockLocal(barcode, total, nearest);
      await replaceLotsLocal(barcode, nextLots.map((l) => ({ expiry_date: l.expiry, qty: l.qty })));
      await enqueue('stock_correction', {
        id: `crn_${nanoid(12)}`,
        barcode,
        product_name: row.name,
        old_qty: originalQty,
        new_qty: total,
        old_expiry: originalExpiry,
        // Canonical shape: per-batch breakdown (the server prefers `lots`).
        lots: nextLots.map((l) => ({ expiry_date: l.expiry, qty: l.qty })),
        // Legacy fields for older servers and audit views.
        new_expiry: nextLots.length === 1 ? nextLots[0].expiry : nearest,
        new_expiries: null,
        performed_by: session?.guardId ?? null,
        performed_by_name: session?.guardName ?? null,
        corrected_at: Date.now(),
        // A count is a dated observation, which lets the server tell that
        // an older in-flight movement was already included in it.
        counted_at: Date.now(),
      });
      // Await so the stock list's refresh sees the server-acknowledged value.
      await flushOnce().catch(() => {});
      haptic.success();
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  // After every hook on purpose: hooks must run in the same order each render.
  if (!can('inventory.adjust')) {
    return <NoPermission title={t('correctCount')} onBack={() => navigation.goBack()} />;
  }
  if (!row) {
    return (
      <View style={[styles.safe, { backgroundColor: palette.background }]}>
        <AppBar title={t('correctCount')} onBack={() => navigation.goBack()} />
      </View>
    );
  }

  const unitWord = shape === 'single' ? formatAmount(2, row.pack_size, row.unit).replace(/^\S+\s*/, '') : t('fullPacksWord');
  const Icon = categoryIcon(row.category);
  const fullCount = full.reduce((s, b) => s + b.qty, 0);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'height' : undefined} style={{ flex: 1 }}>
      <View style={[styles.safe, { backgroundColor: palette.background }]}>
        <AppBar title={t('correctCount')} onBack={() => navigation.goBack()} />

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.xxxl + kbHeight }]} keyboardShouldPersistTaps="handled">
          <View style={styles.product}>
            <IconBadge Icon={Icon} size={56} />
            <View style={{ flex: 1 }}>
              <Text variant="titleLarge" style={{ fontWeight: '700' }} numberOfLines={2}>
                {row.name}
              </Text>
              <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
                {t('appHasAmount', { amount: formatAmount(originalQty, row.pack_size, row.unit) })}
              </Text>
            </View>
            {verifyStatus === 'loading' ? <ActivityIndicator color={palette.primary} /> : null}
          </View>

          {/* What they counted, drawn like the shelf, so a slip is easy to spot. */}
          <View style={{ gap: spacing.sm }}>
            <Text variant="labelLarge" color={palette.onSurfaceVariant} style={styles.label}>
              {t('whatYouCounted')}
            </Text>
            {countsOpen ? (
              <PackShelf Icon={Icon} perPack={perPack} totalSmall={fullCount * perPack + openSmall} unit={row.unit} />
            ) : (
              <SingleShelf Icon={Icon} count={fullCount} />
            )}
          </View>

          <View>
            <Question
              pic={<PackTile kind={shape === 'single' ? 'single' : 'closed'} Icon={Icon} size="sm" />}
              text={shape === 'single' ? t('howManyOnShelf') : t('fullPacksOnShelf')}
            />
            <ExpiryGroups
              batches={full}
              min={0}
              unitWord={unitWord}
              Icon={Icon}
              single={shape === 'single'}
              onChange={(next) => {
                touch();
                setFull(next);
              }}
            />
          </View>

          {countsOpen ? (
            <View>
              <Question
                pic={<PackTile kind="open" Icon={Icon} size="sm" fill={0.5} />}
                text={shape === 'countPack' ? t('openBoxPieces') : t('openPackLeft')}
              />
              <OpenPackInput
                Icon={Icon}
                perPack={perPack}
                value={openSmall}
                unit={row.unit}
                packSize={row.pack_size}
                pieces={shape === 'countPack'}
                onChange={(v) => {
                  touch();
                  setOpenSmall(v);
                }}
              />
            </View>
          ) : null}

          <View style={[styles.total, { backgroundColor: palette.surfaceContainerLow }]}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
                {t('totalOnShelf')}
              </Text>
              {changed && Math.abs(diff) > EPS ? (
                <Text variant="labelLarge" color={palette.amber} style={{ fontWeight: '700' }}>
                  {t(diff < 0 ? 'lessThanApp' : 'moreThanApp', { amount: formatAmount(Math.abs(diff), row.pack_size, row.unit) })}
                </Text>
              ) : null}
            </View>
            <Text variant="headlineSmall" style={{ fontWeight: '800' }}>
              {formatAmount(total, row.pack_size, row.unit)}
            </Text>
          </View>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: palette.background, borderTopColor: palette.outlineVariant }]}>
          {/* Only "nothing loaded yet" and "nothing changed" stop a count.
              Offline is not one of them: it queues and reconciles. */}
          <Button
            label={changed ? t('saveCount') : t('noChanges')}
            onPress={submit}
            loading={saving}
            disabled={!changed || verifyStatus === 'loading'}
            size="lg"
            fullWidth
            Icon={Check}
          />
          <Button label={t('cancel')} variant="text" size="md" onPress={() => navigation.goBack()} style={{ marginTop: spacing.xs }} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * How much is in the open pack, exactly: kg + grams (or l + ml) side by
 * side, or one number of pieces/grams. The pictures above only pre-fill
 * it (tap "½" → 2 kg 500 g), then the person adjusts to the real amount.
 */
function OpenPackInput({
  Icon,
  perPack,
  value,
  unit,
  packSize,
  pieces,
  onChange,
}: {
  Icon: LucideIcon;
  perPack: number;
  value: number;
  unit: string | null;
  packSize: number | null;
  pieces: boolean;
  onChange: (small: number) => void;
}) {
  const t = useT();
  const { palette } = useTheme();
  const { symbol: smallSymbol, perBase } = smallUnit(unit);
  const max = perPack - (pieces ? 1 : 0);
  const fractions: Array<{ f: number; label: string }> = [
    { f: 0, label: t('fillNone') },
    { f: 0.1, label: t('fillLittle') },
    { f: 0.25, label: '¼' },
    { f: 0.5, label: '½' },
    { f: 0.75, label: '¾' },
  ];
  const fromFraction = (f: number) => Math.min(max, Math.round(perPack * f));
  const split = perBase > 1 && perPack >= perBase;
  const big = Math.floor(value / perBase);
  const small = value - big * perBase;

  return (
    <View style={{ gap: spacing.lg }}>
      {/* Pictures: a quick guess for people without a scale. */}
      <View style={styles.fills}>
        {fractions.map(({ f, label }) => {
          const on = value === fromFraction(f);
          return (
            <Pressable
              key={label}
              onPress={() => {
                haptic.tap();
                onChange(fromFraction(f));
              }}
              accessibilityRole="button"
              accessibilityLabel={label}
              // Same border width on and off, so tapping does not nudge the row.
              style={[styles.fill, { borderColor: on ? palette.primary : palette.outlineVariant, backgroundColor: on ? palette.primaryContainer : palette.surfaceContainerLowest }]}
            >
              <PackTile kind="open" Icon={Icon} size="sm" fill={f} />
              <Text variant="labelMedium" color={on ? palette.onPrimaryContainer : palette.onSurface} style={{ fontWeight: '600' }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* The exact amount. */}
      {split ? (
        <View style={styles.two}>
          <View style={[styles.unitBox, { borderColor: palette.outlineVariant }]}>
            <AmountStepper compact value={big} min={0} max={Math.floor(max / perBase)} onChange={(n) => onChange(Math.min(max, n * perBase + small))} />
            <Text variant="labelLarge" color={palette.onSurfaceVariant}>
              {resolveBig(unit)}
            </Text>
          </View>
          <View style={[styles.unitBox, { borderColor: palette.outlineVariant }]}>
            <AmountStepper compact value={small} min={0} max={perBase - 1} step={smallStep(packSize, unit)} onChange={(n) => onChange(Math.min(max, big * perBase + n))} />
            <Text variant="labelLarge" color={palette.onSurfaceVariant}>
              {smallSymbol}
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.unitBox, { borderColor: palette.outlineVariant }]}>
          <AmountStepper value={value} min={0} max={max} step={smallStep(packSize, unit)} onChange={onChange} />
          <Text variant="labelLarge" color={palette.onSurfaceVariant}>
            {pieces ? formatAmount(2 / perPack, packSize, unit).replace(/^\S+\s*/, '') : smallSymbol}
          </Text>
        </View>
      )}
      {split && value > 0 ? (
        <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ textAlign: 'center' }}>
          {formatSmall(value, unit)}
        </Text>
      ) : null}
    </View>
  );
}

/** The big unit's symbol (kg for g, l for ml). */
function resolveBig(unit: string | null): string {
  return formatSmall(smallUnit(unit).perBase, unit).replace(/^\S+\s*/, '');
}

/** A question with the same pack picture the shelf uses. */
function Question({ pic, text }: { pic: React.ReactNode; text: string }) {
  return (
    <View style={styles.questionRow}>
      <View style={styles.questionIcon}>{pic}</View>
      <Text variant="titleMedium" style={{ fontWeight: '700', flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.xxl },
  product: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  questionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  questionIcon: { width: 40, alignItems: 'center', justifyContent: 'center' },
  label: { textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '700' },
  fills: { flexDirection: 'row', gap: spacing.xs },
  fill: { flex: 1, alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: 14, borderWidth: 2 },
  two: { flexDirection: 'row', gap: spacing.md },
  unitBox: { flex: 1, alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderRadius: 16, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  total: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: 16 },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
