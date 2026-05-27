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

/**
 * Chip — uses pure React press styling (no android_ripple) so that
 * background colours update immediately when the theme context changes.
 * android_ripple creates a native RippleDrawable that caches the
 * background paint buffer and blocks re-renders from updating it until
 * the next touch event, which is why language chips were staying in the
 * old theme colours after switching appearance.
 */
export function Chip({ label, selected, onPress, Icon }: Props) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: selected
            ? palette.secondaryContainer
            : pressed
            ? palette.surfaceContainerLow
            : palette.surface,
          borderColor: selected ? palette.secondaryContainer : palette.outlineVariant,
          opacity: pressed ? 0.88 : 1,
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
          numberOfLines={1}
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
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
