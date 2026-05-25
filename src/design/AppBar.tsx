import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { palette, spacing } from './tokens';

type Props = {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  trailing?: React.ReactNode;
};

export function AppBar({ title, subtitle, onBack, trailing }: Props) {
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.row}>
        <View style={styles.leading}>
          {onBack ? <IconButton icon="←" onPress={onBack} /> : <View style={{ width: 44 }} />}
        </View>
        <View style={styles.titleWrap}>
          {title ? <Text variant="titleLarge">{title}</Text> : null}
          {subtitle ? (
            <Text variant="labelMedium" color={palette.onSurfaceVariant}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.trailing}>{trailing}</View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: palette.surface },
  row: {
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leading: { width: 56, alignItems: 'flex-start' },
  trailing: { minWidth: 56, alignItems: 'flex-end', paddingRight: spacing.sm },
  titleWrap: { flex: 1, paddingHorizontal: spacing.sm },
});
