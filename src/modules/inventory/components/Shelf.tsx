import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { PackTile } from '../../../components/PackTile';
import { spacing, Text } from '../../../design';
import { useT } from '../../../i18n';
import { useTheme } from '../../../theme';
import { formatSmall } from '../../../units';
import { takePlan } from '../countMath';
import { haptic } from '../../../utils/haptics';

type T = ReturnType<typeof useT>;

/** How many pictures fit one shelf row before the rest fold into "× N". */
const ROOM = 4;
/** Caption line height (labelMedium) and the space above the first line. */
const CAP_LINE = 16;
const CAP_TOP = 6;

/** "1 closed pack" / "2 closed packs". */
export function closedPacksText(t: T, n: number): string {
  return `${n} ${t(n === 1 ? 'closedPackOne' : 'closedPackMany')}`;
}

/** "2 packs" for a button. */
export function packsText(t: T, n: number): string {
  return `${n} ${t(n === 1 ? 'packOne' : 'packMany')}`;
}

/** The shelf in words: "1 closed pack, open pack has 10 pcs". */
export function shelfText(t: T, totalSmall: number, perPack: number, unit: string | null | undefined): string {
  const total = Math.max(0, Math.round(totalSmall));
  const closed = Math.floor(total / perPack);
  const open = total - closed * perPack;
  const count = closedPacksText(t, closed);
  if (open > 0 && closed === 0) return t('onlyOpenPackHas', { amount: formatSmall(open, unit) });
  return open > 0 ? t('openPackHas', { count, amount: formatSmall(open, unit) }) : count;
}

/**
 * The shelf drawn the way it really is: the open pack first (that is where
 * loose amounts come from), any pack that has to be opened, then the closed
 * ones. Whatever goes in your hand is purple. Tapping a closed pack takes it
 * whole; tapping a purple one puts it back.
 */
export function PackShelf({
  Icon,
  perPack,
  totalSmall,
  unit,
  closedTaken = 0,
  looseTaken = 0,
  onTakeClosed,
  onReturnClosed,
  legend,
}: {
  Icon: LucideIcon;
  /** Small units in one pack (12 pieces, 5000 g). */
  perPack: number;
  /** Everything on the shelf, in small units. */
  totalSmall: number;
  unit: string | null | undefined;
  closedTaken?: number;
  looseTaken?: number;
  onTakeClosed?: () => void;
  onReturnClosed?: () => void;
  legend?: boolean;
}) {
  const t = useT();
  const p = takePlan(totalSmall, perPack, closedTaken, looseTaken);
  const amount = (n: number) => formatSmall(n, unit);
  const figs: React.ReactNode[] = [];

  if (p.open > 0) {
    figs.push(
      <Fig
        key="open"
        tile={<PackTile kind="open" Icon={Icon} fill={(p.open - p.fromOpen) / perPack} out={p.fromOpen / perPack} />}
        line1={t('tileOpen')}
        line2={p.fromOpen > 0 ? t('tileTake', { amount: amount(p.fromOpen) }) : t('tileLeft', { amount: amount(p.open) })}
        go={p.fromOpen > 0}
      />,
    );
  }
  // Only the last newly opened pack is part-used; any before it is emptied
  // completely, which in the hand is the same as a whole pack.
  const lastOpened = p.opened[p.opened.length - 1];
  if (lastOpened !== undefined) {
    figs.push(
      <Fig
        key="opened"
        tile={<PackTile kind="open" Icon={Icon} fill={(perPack - lastOpened) / perPack} out={lastOpened / perPack} />}
        line1={t('tileOpenThis')}
        line2={t('tileTake', { amount: amount(lastOpened) })}
        go
      />,
    );
  }
  const takenCount = closedTaken + Math.max(0, p.opened.length - 1);
  const [takenSlots, leftSlots] = shareSlots(takenCount, p.sealedLeft, ROOM - figs.length);
  figs.push(
    ...group(takenCount, takenSlots, (i, times) => (
      <Fig
        key={`taken-${i}`}
        tile={<PackTile kind="closed" Icon={Icon} taken />}
        line1={t('tileTakeWhole')}
        line2={times}
        go
        onPress={closedTaken > 0 ? onReturnClosed : undefined}
      />
    )),
    ...group(p.sealedLeft, leftSlots, (i, times) => (
      <Fig key={`closed-${i}`} tile={<PackTile kind="closed" Icon={Icon} />} line1={t('tileClosed')} line2={times} onPress={onTakeClosed} />
    )),
  );

  return <ShelfFrame legend={legend} empty={figs.length === 0}>{figs}</ShelfFrame>;
}

/** Things that never come in packs: one tile each, the taken ones purple. */
export function SingleShelf({ Icon, count, taking = 0, legend }: { Icon: LucideIcon; count: number; taking?: number; legend?: boolean }) {
  const total = Math.max(0, Math.floor(count));
  const take = Math.min(total, Math.max(0, Math.floor(taking)));
  const left = total - take;
  const [takeSlots, leftSlots] = shareSlots(take, left, ROOM + 1);
  // Single items have no words under them, except "× 20" on a folded row.
  const capLines = take > takeSlots || left > leftSlots ? 1 : 0;
  const figs = [
    ...group(take, takeSlots, (i, times) => (
      <Fig key={`t-${i}`} tile={<PackTile kind="single" Icon={Icon} taken />} line1={times} go capLines={capLines} tileH={52} />
    )),
    ...group(left, leftSlots, (i, times) => (
      <Fig key={`l-${i}`} tile={<PackTile kind="single" Icon={Icon} />} line1={times} capLines={capLines} tileH={52} />
    )),
  ];
  return <ShelfFrame legend={legend} empty={figs.length === 0}>{figs}</ShelfFrame>;
}

/**
 * Splits the free picture slots between "taken" and "left", giving each
 * group at least one when it has anything, so the row never grows past
 * its room however much stock there is.
 */
function shareSlots(a: number, b: number, room: number): [number, number] {
  const n = Math.max(a > 0 && b > 0 ? 2 : 1, room);
  if (a <= 0) return [0, Math.min(b, n)];
  if (b <= 0) return [Math.min(a, n), 0];
  let sb = Math.min(b, n - 1);
  const sa = Math.min(a, n - sb);
  sb = Math.min(b, n - sa);
  return [sa, sb];
}

/**
 * `count` things drawn in `slots` pictures. When they do not all fit, the
 * last picture stands for the rest and says how many: "× 7".
 */
function group(count: number, slots: number, make: (i: number, times?: string) => React.ReactNode): React.ReactNode[] {
  const k = Math.min(count, slots);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < k; i++) {
    const isLast = i === k - 1;
    out.push(make(i, isLast && count > k ? `× ${count - (k - 1)}` : undefined));
  }
  return out;
}

function ShelfFrame({ children, legend, empty }: { children: React.ReactNode; legend?: boolean; empty: boolean }) {
  const t = useT();
  const { palette } = useTheme();
  return (
    <View style={[styles.shelf, { backgroundColor: palette.shelf }]}>
      <View style={styles.row}>
        {empty ? (
          <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ paddingVertical: spacing.xl }}>
            {t('shelfEmpty')}
          </Text>
        ) : (
          children
        )}
      </View>
      <View style={[styles.plank, { backgroundColor: palette.shelfPlank }]} />
      {legend ? (
        <View style={styles.legend}>
          <View style={[styles.swatch, { backgroundColor: palette.primaryContainer, borderColor: palette.primary }]} />
          <Text variant="labelMedium" color={palette.onSurfaceVariant} numberOfLines={1} style={{ flexShrink: 0 }}>
            {t('goesInHand')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * One picture on the shelf with up to two caption lines. Every figure has
 * the same tile box and caption box, so all tiles stand on the same line
 * whether they have one caption line or two, and figures share the row
 * width (flex) so four always fit, even on a small phone.
 */
function Fig({
  tile,
  line1,
  line2,
  go,
  onPress,
  capLines = 2,
  tileH = 64,
}: {
  tile: React.ReactNode;
  line1?: string;
  line2?: string;
  go?: boolean;
  onPress?: () => void;
  /** Caption lines every figure on this shelf reserves (0 = none). */
  capLines?: number;
  /** Height of the tile space: the tallest tile on this shelf. */
  tileH?: number;
}) {
  const { palette } = useTheme();
  const color = go ? palette.primary : palette.onSurfaceVariant;
  const body = (
    <>
      <View style={[styles.tileBox, { height: tileH }]}>{tile}</View>
      {capLines > 0 ? (
        <View style={[styles.capBox, { height: CAP_TOP + capLines * CAP_LINE }]}>
          {line1 ? <Caption text={line1} color={color} /> : null}
          {line2 ? <Caption text={line2} color={color} strong /> : null}
        </View>
      ) : null}
    </>
  );
  if (!onPress) return <View style={styles.fig}>{body}</View>;
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={line1}
      style={styles.fig}
    >
      {body}
    </Pressable>
  );
}

/** Shrinks a long caption to fit rather than cutting it off with "…". */
function Caption({ text, color, strong }: { text: string; color: string; strong?: boolean }) {
  return (
    <Text
      variant="labelMedium"
      color={color}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      style={[styles.cap, strong && { fontWeight: '800' }]}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  shelf: { borderRadius: 18, paddingTop: spacing.lg, paddingBottom: spacing.md, paddingHorizontal: spacing.sm, gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: spacing.xs, paddingBottom: spacing.xs },
  fig: { flex: 1, maxWidth: 80, alignItems: 'center' },
  // Bottom-aligned in a fixed box: every tile stands on the same line.
  tileBox: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'flex-end' },
  capBox: { alignSelf: 'stretch', paddingTop: CAP_TOP, alignItems: 'center' },
  cap: { textAlign: 'center', letterSpacing: 0, alignSelf: 'stretch' },
  plank: { height: 6, borderRadius: 3, marginHorizontal: spacing.xs },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 1.5, borderStyle: 'dashed' },
});
