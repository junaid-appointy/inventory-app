import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { haptic } from '../utils/haptics';
import { Text } from './Text';
import { radius, spacing } from './tokens';

type Props = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  leadingIcon?: string;
};

export function Chip({ label, selected, onPress, leadingIcon }: Props) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      android_ripple={{ color: palette.outlineVariant }}
      style={[
        styles.base,
        {
          backgroundColor: selected ? palette.secondaryContainer : palette.surface,
          borderColor: selected ? palette.secondaryContainer : palette.outlineVariant,
        },
      ]}
    >
      <View style={styles.row}>
        {selected ? (
          <Text variant="labelLarge" color={palette.onSecondaryContainer}>
            ✓
          </Text>
        ) : leadingIcon ? (
          <Text variant="labelLarge" color={palette.onSurface}>
            {leadingIcon}
          </Text>
        ) : null}
        <Text
          variant="labelLarge"
          color={selected ? palette.onSecondaryContainer : palette.onSurface}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
