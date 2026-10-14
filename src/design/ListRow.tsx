import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';
import { spacing } from './tokens';
import type { Tone } from './tone';

/**
 * A plain list row: optional line icon, title, one line of detail,
 * something on the right, chevron when it opens more. No card, no tint;
 * rows sit on white separated by hairlines. At least 64dp tall.
 */
export function ListRow({
  Icon,
  tone = 'neutral',
  title,
  subtitle,
  trailing,
  onPress,
  leading,
  showChevron,
  inset = spacing.xl,
}: {
  Icon?: LucideIcon;
  /** Only warn/danger colour the icon; everything else stays grey. */
  tone?: Tone;
  title: string;
  subtitle?: string | null;
  trailing?: React.ReactNode;
  onPress?: () => void;
  leading?: React.ReactNode;
  showChevron?: boolean;
  inset?: number;
}) {
  const { palette } = useTheme();
  const chevron = showChevron ?? !!onPress;
  const iconColor = tone === 'warn' ? palette.amber : tone === 'danger' ? palette.error : palette.onSurfaceVariant;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      android_ripple={onPress ? { color: palette.surfaceContainerHigh } : undefined}
      style={[styles.row, { paddingHorizontal: inset }]}
    >
      {leading ?? (Icon ? <Icon size={26} color={iconColor} strokeWidth={1.8} /> : null)}
      <View style={{ flex: 1 }}>
        <Text variant="titleMedium" numberOfLines={1} style={{ fontWeight: '600' }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodyMedium" color={palette.onSurfaceVariant} numberOfLines={1} style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {typeof trailing === 'string' ? (
        <Text variant="bodyLarge" color={palette.onSurfaceVariant}>
          {trailing}
        </Text>
      ) : (
        trailing
      )}
      {chevron ? <ChevronRight size={20} color={palette.outline} /> : null}
    </Pressable>
  );
}

/** Hairline between rows, indented to the text like a native list. */
export function RowDivider({ inset = spacing.xl }: { inset?: number }) {
  const { palette } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.outlineVariant, marginLeft: inset, marginRight: inset }} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: 68,
    paddingVertical: spacing.md,
  },
});
