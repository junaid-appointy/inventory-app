import React from 'react';
import { View } from 'react-native';
import { AppBar, Text, spacing } from '../design';
import { useT } from '../i18n';
import { useTheme } from '../theme';

/**
 * Body for a screen the person reached but may not use (e.g. an old deep
 * link after their role changed). The server refuses the write anyway; this
 * just avoids a form they cannot submit.
 */
export function NoPermission({ title, onBack }: { title: string; onBack: () => void }) {
  const t = useT();
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <AppBar title={title} onBack={onBack} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
        <Text variant="bodyLarge" style={{ textAlign: 'center' }}>
          {t('noPermissionScreen')}
        </Text>
      </View>
    </View>
  );
}
