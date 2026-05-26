import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { radius, spacing } from './tokens';

type Props = {
  onPress?: () => void;
  tone?: 'filled' | 'outlined' | 'elevated';
  padding?: keyof typeof spacing;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export function Card({ onPress, tone = 'filled', padding = 'lg', style, children }: Props) {
  const { palette } = useTheme();
  const Container: any = onPress ? Pressable : View;
  const bg =
    tone === 'outlined'
      ? palette.surface
      : tone === 'elevated'
      ? palette.surfaceContainerLowest
      : palette.surfaceContainerLow;

  return (
    <Container
      onPress={onPress}
      android_ripple={onPress ? { color: palette.outlineVariant } : undefined}
      style={[
        {
          backgroundColor: bg,
          borderRadius: radius.lg,
          padding: spacing[padding],
          borderWidth: tone === 'outlined' ? 1 : 0,
          borderColor: palette.outlineVariant,
          ...(tone === 'elevated'
            ? {
                shadowColor: '#000',
                shadowOpacity: 0.08,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 2,
              }
            : null),
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </Container>
  );
}
