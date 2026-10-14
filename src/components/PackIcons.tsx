import { Package, type LucideIcon } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { spacing, Text } from '../design';
import { useTheme } from '../theme';
import { PackTile } from './PackTile';

const MAX_SHOWN = 6;

/**
 * The amount drawn as closed packs (the same tile the shelf uses), so "3"
 * is also three packs. Up to six are drawn (one row on any phone); above
 * that, six and "+N".
 * `single` draws one-thing tiles for items that never come in packs.
 */
export function PackIcons({ count, Icon = Package, single }: { count: number; Icon?: LucideIcon; single?: boolean }) {
  const { palette } = useTheme();
  const shown = Math.min(Math.max(0, Math.floor(count)), MAX_SHOWN);
  const extra = Math.floor(count) - shown;
  if (shown === 0) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 4 }}>
      {Array.from({ length: shown }).map((_, i) => (
        <PackTile key={i} kind={single ? 'single' : 'closed'} Icon={Icon} size="sm" />
      ))}
      {extra > 0 ? (
        <Text variant="titleMedium" color={palette.onSurfaceVariant} style={{ marginLeft: spacing.xs, fontWeight: '800', alignSelf: 'center' }}>
          +{extra}
        </Text>
      ) : null}
    </View>
  );
}
