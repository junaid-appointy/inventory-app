import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { palette, radius, spacing } from './tokens';

type Tone = 'success' | 'warn' | 'danger' | 'neutral';

const TONE: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: palette.primaryContainer, fg: palette.onPrimaryContainer },
  warn: { bg: palette.warnContainer, fg: palette.onWarnContainer },
  danger: { bg: palette.errorContainer, fg: palette.onErrorContainer },
  neutral: { bg: palette.surfaceContainerHigh, fg: palette.onSurfaceVariant },
};

type Props = {
  label: string;
  tone?: Tone;
  leadingIcon?: string;
};

export function StatusPill({ label, tone = 'neutral', leadingIcon }: Props) {
  const t = TONE[tone];
  return (
    <View style={[styles.base, { backgroundColor: t.bg }]}>
      {leadingIcon ? (
        <Text variant="labelLarge" color={t.fg}>
          {leadingIcon}
        </Text>
      ) : null}
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
