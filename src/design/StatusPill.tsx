import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';
import { radius, spacing } from './tokens';

type Tone = 'success' | 'warn' | 'danger' | 'neutral';

type Props = {
  label: string;
  tone?: Tone;
  /** Optional leading icon (Lucide component). */
  Icon?: LucideIcon;
};

export function StatusPill({ label, tone = 'neutral', Icon }: Props) {
  const { palette } = useTheme();
  const toneMap: Record<Tone, { bg: string; fg: string }> = {
    success: { bg: palette.primaryContainer, fg: palette.onPrimaryContainer },
    warn: { bg: palette.warnContainer, fg: palette.onWarnContainer },
    danger: { bg: palette.errorContainer, fg: palette.onErrorContainer },
    neutral: { bg: palette.surfaceContainerHigh, fg: palette.onSurfaceVariant },
  };
  const t = toneMap[tone];
  return (
    <View style={[styles.base, { backgroundColor: t.bg }]}>
      {Icon ? <Icon size={14} color={t.fg} strokeWidth={2.4} /> : null}
      <Text variant="labelLarge" color={t.fg}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
