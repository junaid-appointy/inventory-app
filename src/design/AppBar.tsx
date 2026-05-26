import { ArrowLeft } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { spacing } from './tokens';

type Props = {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  trailing?: React.ReactNode;
};

export function AppBar({ title, subtitle, onBack, trailing }: Props) {
  const { palette } = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: palette.surface }}>
      <View style={styles.row}>
        <View style={styles.leading}>
          {onBack ? <IconButton Icon={ArrowLeft} onPress={onBack} /> : <View style={{ width: 44 }} />}
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
