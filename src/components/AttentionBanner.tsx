import { AlertTriangle, ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { spacing, Text } from '../design';
import { useT } from '../i18n';
import { useTheme } from '../theme';

/** One soft amber line when something needs a person (design 04). Hidden otherwise. */
export function AttentionBanner({ text, onPress }: { text: string; onPress: () => void }) {
  const t = useT();
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.box, { backgroundColor: palette.amberSoft, borderColor: palette.amberLine }]}
    >
      <AlertTriangle size={24} color={palette.amber} strokeWidth={2.2} />
      <Text variant="bodyLarge" style={{ flex: 1, fontWeight: '500' }}>
        {text}
      </Text>
      <Text variant="labelLarge" color={palette.primary} style={{ fontWeight: '700' }}>
        {t('viewAction')}
      </Text>
      <ChevronRight size={18} color={palette.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    paddingHorizontal: spacing.lg,
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 1,
  },
});
