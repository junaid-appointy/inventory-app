import React from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { haptic } from '../utils/haptics';
import { Text } from './Text';
import { hitSlop, palette, radius } from './tokens';

type Props = {
  icon: string;
  onPress: () => void;
  size?: number;
  tone?: 'default' | 'inverse';
  style?: StyleProp<ViewStyle>;
};

export function IconButton({ icon, onPress, size = 44, tone = 'default', style }: Props) {
  const color = tone === 'inverse' ? palette.surface : palette.onSurface;
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
      <Text variant="titleLarge" color={color}>
        {icon}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
