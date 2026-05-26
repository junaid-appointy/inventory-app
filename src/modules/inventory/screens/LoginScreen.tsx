import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../auth';
import { config } from '../../../config';
import {
  Button,
  palette,
  spacing,
  Text,
  TextField,
} from '../../../design';
import { useT } from '../../../i18n';
import { haptic } from '../../../utils/haptics';

export function LoginScreen() {
  const t = useT();
  const { login } = useAuth();
  const [guardName, setGuardName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = guardName.trim().length > 0 && pin.trim().length >= 4 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await login({ guardName: guardName.trim(), pin: pin.trim() });
      haptic.success();
      // AuthProvider flips state → RootNavigator swaps to the main stack.
    } catch (e) {
      haptic.warn();
      const msg = e instanceof Error ? e.message : String(e);
      // Native fetch surfaces "Network request failed" with no detail.
      // Add the URL so a misconfigured base or unreachable server is obvious.
      if (msg.toLowerCase().includes('network request failed')) {
        setError(`Cannot reach ${config.apiBaseUrl}. Is the backend running, and is the URL right for this device?`);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text variant="labelLarge" color={palette.onSurfaceVariant}>
              {t('guard').toUpperCase()}
            </Text>
            <Text variant="displayMedium" style={{ marginTop: spacing.xs }}>
              {t('appName')}
            </Text>
            <Text
              variant="bodyLarge"
              color={palette.onSurfaceVariant}
              style={{ marginTop: spacing.md }}
            >
              Sign in with your name and PIN.
            </Text>
          </View>

          <View style={{ marginTop: spacing.xl, gap: spacing.lg }}>
            <TextField
              label="Guard name"
              value={guardName}
              onChangeText={setGuardName}
              placeholder="As registered by your supervisor"
              autoCapitalize="words"
              returnKeyType="next"
            />
            <TextField
              label="PIN"
              value={pin}
              onChangeText={setPin}
              placeholder="4–6 digits"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={submit}
            />
            {error ? (
              <Text variant="bodyMedium" color={palette.error}>
                {error}
              </Text>
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={busy ? 'Signing in…' : 'Sign in'}
            onPress={submit}
            disabled={!canSubmit}
            loading={busy}
            size="lg"
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  scroll: { padding: spacing.xl, flexGrow: 1 },
  header: { marginTop: spacing.xxl },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: palette.outlineVariant,
    backgroundColor: palette.surface,
  },
});
