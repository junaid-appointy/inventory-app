import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { spacing, Text } from '../design';
import { useTheme } from '../theme';

/** A big outlined row that opens a task (design 04): line icon, title, chevron. */
export function NavRow({ Icon, label, detail, onPress }: { Icon: LucideIcon; label: string; detail?: string; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      android_ripple={{ color: palette.surfaceContainerHigh }}
      style={[styles.row, { borderColor: palette.outlineVariant, backgroundColor: palette.surfaceContainerLowest }]}
    >
      <Icon size={26} color={palette.onSurfaceVariant} strokeWidth={1.8} />
      <View style={{ flex: 1 }}>
        <Text variant="titleMedium" style={{ fontWeight: '600' }}>
          {label}
        </Text>
        {detail ? (
          <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: 2 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={22} color={palette.outline} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: 64,
    marginHorizontal: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
