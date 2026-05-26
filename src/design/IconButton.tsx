import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { haptic } from '../utils/haptics';
import { hitSlop, radius } from './tokens';

type Props = {
  /** A Lucide icon component, e.g. `import { X } from 'lucide-react-native'`. */
  Icon: LucideIcon;
  onPress: () => void;
  /** Hit-area size. Icon glyph is sized as ~55% of this. */
  size?: number;
  tone?: 'default' | 'inverse';
  style?: StyleProp<ViewStyle>;
};

export function IconButton({ Icon, onPress, size = 44, tone = 'default', style }: Props) {
  const { palette } = useTheme();
  const color = tone === 'inverse' ? palette.surface : palette.onSurface;
  const glyphSize = Math.round(size * 0.55);
  return (
    <Pressable
      hitSlop={hitSlop}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      android_ripple={{ color: palette.outlineVariant, borderless: true, radius: size / 2 }}
      style={[styles.base, { width: size, height: size, borderRadius: radius.pill }, style]}
    >
      <Icon size={glyphSize} color={color} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
