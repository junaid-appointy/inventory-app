import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';
import { spacing } from './tokens';

/** Quiet grey section label (design 06 "Expected now") with an optional "View all" link. */
export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, marginTop: spacing.xxl, marginBottom: spacing.xs }}>
      <Text variant="titleMedium" color={palette.onSurfaceVariant} style={{ flex: 1, fontWeight: '500' }}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text variant="labelLarge" color={palette.primary}>
            {actionLabel}
          </Text>
          <ChevronRight size={18} color={palette.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}
