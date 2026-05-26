import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../theme';
import { haptic } from '../utils/haptics';
import { Text } from './Text';
import { motion, radius, spacing } from './tokens';

export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

type Props = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

type Tokens = { bg: string; fg: string; border: string; pressedBg: string };

const SIZES: Record<
  ButtonSize,
  { h: number; px: number; gap: number; variant: 'labelLarge' | 'titleMedium' | 'titleLarge' | 'headlineSmall' }
> = {
  sm: { h: 40, px: spacing.lg, gap: spacing.sm, variant: 'labelLarge' },
  md: { h: 52, px: spacing.xl, gap: spacing.sm, variant: 'titleMedium' },
  lg: { h: 64, px: spacing.xl, gap: spacing.md, variant: 'titleLarge' },
  xl: { h: 88, px: spacing.xl, gap: spacing.md, variant: 'headlineSmall' },
};

/**
 * Darken a hex color by a fixed amount. Used to derive a pressed-state
 * shade from the theme's primary so we don't hardcode a color that only
 * looks right under one brand.
 */
function darken(hex: string, amount = 0.12): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const r = Math.max(0, Math.round(((num >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.round(((num >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.round((num & 0xff) * (1 - amount)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function Button({
  label,
  onPress,
  variant = 'filled',
  size = 'md',
  leadingIcon,
  trailingIcon,
  disabled,
  loading,
  fullWidth,
  style,
  testID,
}: Props) {
  const { palette } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const s = SIZES[size];
  const isDisabled = !!disabled || !!loading;

  const t: Tokens = (() => {
    if (isDisabled) {
      return {
        bg: palette.surfaceContainerHighest,
        fg: palette.onSurfaceVariant,
        border: 'transparent',
        pressedBg: palette.surfaceContainerHighest,
      };
    }
    switch (variant) {
      case 'filled':
        return {
          bg: palette.primary,
          fg: palette.onPrimary,
          border: 'transparent',
          pressedBg: darken(palette.primary, 0.18),
        };
      case 'tonal':
        return {
          bg: palette.primaryContainer,
          fg: palette.onPrimaryContainer,
          border: 'transparent',
          pressedBg: darken(palette.primaryContainer, 0.08),
        };
      case 'outlined':
        return {
          bg: 'transparent',
          fg: palette.primary,
          border: palette.outline,
          pressedBg: palette.surfaceContainerLow,
        };
      case 'text':
        return {
          bg: 'transparent',
          fg: palette.primary,
          border: 'transparent',
          pressedBg: palette.surfaceContainerLow,
        };
      case 'danger':
        return {
          bg: palette.errorContainer,
          fg: palette.onErrorContainer,
          border: 'transparent',
          pressedBg: darken(palette.errorContainer, 0.1),
        };
    }
  })();

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: motion.fast,
      useNativeDriver: true,
    }).start();

  return (
    <Animated.View style={[fullWidth && { alignSelf: 'stretch' }, { transform: [{ scale }] }, style]}>
      <Pressable
        testID={testID}
        disabled={isDisabled}
        onPressIn={() => animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        onPress={() => {
          haptic.tap();
          onPress();
        }}
        android_ripple={{ color: t.pressedBg, borderless: false }}
        style={({ pressed }) => [
          styles.base,
          {
            minHeight: s.h,
            paddingHorizontal: s.px,
            backgroundColor: pressed ? t.pressedBg : t.bg,
            borderColor: t.border,
            borderWidth: variant === 'outlined' ? 1.5 : 0,
            opacity: isDisabled ? 0.6 : 1,
          },
        ]}
      >
        <View style={[styles.row, { gap: s.gap }]}>
          {leadingIcon ? <View>{leadingIcon}</View> : null}
          <Text variant={s.variant} color={t.fg}>
            {loading ? 'Working…' : label}
          </Text>
          {trailingIcon ? <View>{trailingIcon}</View> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
