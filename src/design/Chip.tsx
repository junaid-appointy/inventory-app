import { Check, type LucideIcon } from 'lucide-react-native';
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
  /** Optional leading icon shown when the chip is unselected. */
  Icon?: LucideIcon;
};

export function Chip({ label, selected, onPress, Icon }: Props) {
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
          <Check size={16} color={palette.onSecondaryContainer} strokeWidth={2.5} />
        ) : Icon ? (
          <Icon size={16} color={palette.onSurface} strokeWidth={2.2} />
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
