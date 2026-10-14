import type { LucideIcon } from 'lucide-react-native';
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
import { useT } from '../i18n';
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
  /**
   * Preferred over `leadingIcon`: drawn in the button's own text colour, so
   * it greys out with the label when disabled and turns white with it when
   * enabled. A `leadingIcon` node keeps whatever colour the caller baked in.
   */
  Icon?: LucideIcon;
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
  // Slimmer than before (was 40/52/64/88): 56 is still an easy thumb target
  // and reads as a button, not a block.
  sm: { h: 40, px: spacing.lg, gap: spacing.sm, variant: 'labelLarge' },
  md: { h: 48, px: spacing.xl, gap: spacing.sm, variant: 'titleMedium' },
  lg: { h: 56, px: spacing.xl, gap: spacing.sm, variant: 'titleMedium' },
  xl: { h: 64, px: spacing.xl, gap: spacing.md, variant: 'titleLarge' },
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
  Icon,
  leadingIcon,
  trailingIcon,
  disabled,
  loading,
  fullWidth,
  style,
  testID,
}: Props) {
  const { palette } = useTheme();
  const tr = useT();
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
        // No android_ripple on purpose. On Android (new architecture) the
        // native RippleDrawable caches this view's background, so a button
        // that turned from disabled grey to enabled purple kept showing grey
        // until it was touched. Same root cause the Chip comment describes.
        // The pressed colour below is pure React and always repaints.
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
          {Icon ? (
            <Icon size={s.h >= 56 ? 22 : 18} color={t.fg} strokeWidth={2.2} />
          ) : leadingIcon ? (
            <View style={{ opacity: isDisabled ? 0.5 : 1 }}>{leadingIcon}</View>
          ) : null}
          {/* flexShrink gives adjustsFontSizeToFit a width bound to shrink
              against — without it, a long label (e.g. Hindi, which runs
              wider than English) wraps to a second line inside the button
              instead of scaling the font down. minimumFontScale stops it
              shrinking to an unreadable size. */}
          <Text
            variant={s.variant}
            color={t.fg}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            style={{ flexShrink: 1, textAlign: 'center' }}
          >
            {loading ? tr('working') : label}
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
