import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { palette, spacing } from './tokens';

type Props = {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
};

export function ListItem({ leading, title, subtitle, trailing, onPress }: Props) {
  const C: any = onPress ? Pressable : View;
  return (
    <C
      onPress={onPress}
      android_ripple={onPress ? { color: palette.outlineVariant } : undefined}
      style={styles.row}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.body}>
        <Text variant="titleMedium">{title}</Text>
        {subtitle ? (
          <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </C>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leading: { marginRight: spacing.md },
  body: { flex: 1 },
  trailing: { marginLeft: spacing.md },
});
