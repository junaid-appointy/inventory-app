import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../auth';
import { refreshSessionAccess } from '../auth/refresh';
import { Button, Text, spacing } from '../design';
import { useT } from '../i18n';
import { useTheme } from '../theme';

/**
 * Shown when the signed-in person can open no module at all. Never a dead
 * end: they can check again once an admin gives access, or sign out.
 */
export function NoAccessScreen() {
  const t = useT();
  const { palette } = useTheme();
  const { logout } = useAuth();
  const [checking, setChecking] = useState(false);

  const checkAgain = async () => {
    setChecking(true);
    try {
      await refreshSessionAccess();
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <Text variant="headlineSmall" style={styles.center}>
        {t('noAccessTitle')}
      </Text>
      <Text variant="bodyLarge" color={palette.onSurfaceVariant} style={[styles.center, { marginTop: spacing.sm }]}>
        {t('noAccessBody')}
      </Text>
      <View style={{ height: spacing.xl }} />
      <Button label={t('checkAgain')} onPress={checkAgain} loading={checking} size="lg" fullWidth />
      <View style={{ height: spacing.sm }} />
      <Button label={t('signOut')} onPress={() => void logout()} variant="outlined" size="md" fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  center: { textAlign: 'center' },
});
