import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';

/**
 * One picture of a pack, the same for every product (pens, sugar, milk,
 * biscuits). We never draw what the pack looks like, only its state:
 *
 *   closed  full, with a dark seal strip on top: nobody has opened it
 *   open    no lid, filled to how much is left
 *   single  one thing that never comes in a pack (a bottle, a detergent)
 *
 * The product's category icon sits on it so people can tell items apart.
 * Purple always means "goes in your hand": a whole tile (taken) or a band
 * on top of the fill (out) for part of an open pack. Tiles never move: a
 * lifted tile reads as misaligned, so colour alone carries "taken".
 */
export type PackTileKind = 'closed' | 'open' | 'single';

const SIZES = {
  md: { w: 52, h: 64, r: 12, seal: 11, icon: 22, single: { w: 40, h: 52 } },
  sm: { w: 30, h: 38, r: 8, seal: 7, icon: 15, single: { w: 26, h: 34 } },
} as const;

export function PackTile({
  kind,
  Icon,
  fill = 1,
  out = 0,
  taken = false,
  size = 'md',
}: {
  kind: PackTileKind;
  Icon: LucideIcon;
  /** Open pack only: how full it stays, 0 to 1. */
  fill?: number;
  /** Open pack only: the part being taken out, 0 to 1, drawn above the fill. */
  out?: number;
  /** The whole tile goes in your hand. */
  taken?: boolean;
  size?: 'md' | 'sm';
}) {
  const { palette } = useTheme();
  const s = SIZES[size];
  const w = kind === 'single' ? s.single.w : s.w;
  const h = kind === 'single' ? s.single.h : s.h;
  const f = kind === 'open' ? Math.max(0, Math.min(1, fill)) : 1;
  const o = kind === 'open' ? Math.max(0, Math.min(1 - f, out)) : 0;
  const edge = taken ? palette.primary : palette.packEdge;

  return (
    <View
      style={[
        styles.tile,
        {
          width: w,
          height: h,
          borderRadius: s.r,
          borderColor: edge,
          borderStyle: taken ? 'dashed' : 'solid',
          backgroundColor: taken ? palette.primaryContainer : palette.surfaceContainerLowest,
        },
        // No lid: an open pack is drawn without its top edge.
        kind === 'open' && { borderTopWidth: 0, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
      ]}
    >
      <View style={[styles.fill, { height: `${f * 100}%`, backgroundColor: taken ? palette.primaryContainer : palette.packFill }]} />
      {o > 0 ? (
        <View
          style={[
            styles.out,
            { bottom: `${f * 100}%`, height: `${o * 100}%`, backgroundColor: palette.primaryContainer, borderColor: palette.primary },
          ]}
        />
      ) : null}
      {kind === 'closed' ? (
        <View style={[styles.seal, { height: s.seal, backgroundColor: taken ? palette.primary : palette.packSeal }]} />
      ) : null}
      <View style={[styles.icon, kind === 'closed' && { top: s.seal }]}>
        <Icon size={s.icon} color={taken ? palette.onPrimaryContainer : palette.onPack} strokeWidth={2} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderWidth: 2, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  // Solid edges: Android draws a dashed border on only some sides unreliably.
  out: { position: 'absolute', left: 0, right: 0, borderTopWidth: 2 },
  seal: { position: 'absolute', left: 0, right: 0, top: 0 },
  icon: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
