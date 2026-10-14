import { AlertTriangle, CheckCircle2, Clock, XCircle, type LucideIcon } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';
import { spacing } from './tokens';
import type { Tone } from './tone';

const DEFAULT_ICON: Partial<Record<Tone, LucideIcon>> = {
  success: CheckCircle2,
  warn: AlertTriangle,
  danger: XCircle,
  info: Clock,
};

/**
 * Status as a coloured icon plus a plain word (no pill). The icon carries
 * the colour and the meaning; the word stays in body colour so a list of
 * statuses reads calm instead of loud.
 */
export function StatusChip({ label, tone, Icon }: { label: string; tone: Tone; Icon?: LucideIcon | null }) {
  const { palette } = useTheme();
  const iconColor =
    tone === 'success' ? palette.success
      : tone === 'warn' ? palette.amber
        : tone === 'danger' ? palette.error
          : tone === 'primary' ? palette.primary
            : palette.onSurfaceVariant;
  const I = Icon === null ? null : Icon ?? DEFAULT_ICON[tone] ?? null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 }}>
      {I ? <I size={18} color={iconColor} strokeWidth={2.4} /> : null}
      <Text variant="bodyLarge" color={tone === 'danger' ? palette.error : palette.onSurface}>
        {label}
      </Text>
    </View>
  );
}
