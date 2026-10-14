import { useFocusEffect } from '@react-navigation/native';
import { setStatusBarStyle } from 'expo-status-bar';
import { AlertCircle, LogIn } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../auth';
import { config } from '../../../config';
import { Button, spacing, Text, TextField } from '../../../design';
import { useKeyboardHeight } from '../../../hooks/useKeyboardHeight';
import { useI18n, useT } from '../../../i18n';
import { ApiError } from '../../../sync/api';
import { useTheme, useThemeControls } from '../../../theme';
import { haptic } from '../../../utils/haptics';

/** PINs are exactly 6 digits (issued that way by the dashboard). */
const PIN_LENGTH = 6;

/**
 * Sign in: the same plum band as the hub screens (logo, name, language),
 * a white sheet with the name field and PIN boxes, one big button. Errors
 * are one plain sentence, never a server message.
 */
export function LoginScreen() {
  const t = useT();
  const { lang, setLang } = useI18n();
  const { palette } = useTheme();
  const { themeName } = useThemeControls();
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardHeight();
  const { login } = useAuth();
  const [guardName, setGuardName] = useState('');
  const [pin, setPin] = useState('');
  const [pinFocused, setPinFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; detail?: string } | null>(null);
  const pinRef = useRef<TextInput>(null);

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle(themeName === 'steadyPurpleDark' ? 'light' : 'dark');
    }, [themeName]),
  );

  const ready = guardName.trim().length > 0 && pin.length === PIN_LENGTH;
  const readyWith = (p: string) => guardName.trim().length > 0 && p.length === PIN_LENGTH;

  const submit = async (pinValue: string = pin) => {
    if (busy) return;
    if (!readyWith(pinValue)) {
      setError({ text: t('fillDetailsError') });
      haptic.warn();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login({ guardName: guardName.trim(), pin: pinValue });
      haptic.success();
      // AuthProvider flips state → RootNavigator swaps to the main stack.
    } catch (e) {
      haptic.warn();
      setPin('');
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof ApiError && e.status === 401) {
        setError({ text: t('wrongNameOrPin') });
      } else if (e instanceof ApiError && e.status === 429) {
        setError({ text: t('tooManyTries') });
      } else if (msg.toLowerCase().includes('network request failed')) {
        // Keep the address visible: it is the fastest fix for a wrong URL.
        setError({ text: t('cannotReachServer'), detail: config.apiBaseUrl });
      } else {
        setError({ text: t('somethingWrong'), detail: msg });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: palette.band }]}>
      <ScrollView
        style={{ backgroundColor: palette.background }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: kbHeight }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.band, { backgroundColor: palette.band, paddingTop: insets.top + spacing.md }]}>
          <View style={styles.langRow}>
            <View style={styles.langSwitch}>
              {(['en', 'hi'] as const).map((l) => {
                const on = lang === l;
                return (
                  <Pressable
                    key={l}
                    onPress={() => setLang(l)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[styles.langBtn, on && { backgroundColor: palette.onBand }]}
                  >
                    <Text variant="labelLarge" color={on ? palette.band : palette.onBand} style={{ fontWeight: '700' }}>
                      {l === 'en' ? 'EN' : 'हिं'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={[styles.logo, { backgroundColor: palette.surfaceContainerLowest }]}>
            <Image source={require('../../../../assets/icon-192x192.png')} style={{ width: 52, height: 52 }} />
          </View>
          <Text style={[styles.brand, { color: palette.onBand }]}>Auxilio</Text>
          <Text variant="bodyLarge" color={palette.onBandMuted} style={{ marginTop: spacing.xs }}>
            {t('signInWithPin')}
          </Text>
        </View>

        <View style={[styles.sheet, { backgroundColor: palette.background }]}>
          <TextField
            label={t('guardName')}
            helper={t('guardNameHint')}
            value={guardName}
            onChangeText={(v) => {
              setGuardName(v);
              setError(null);
            }}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => pinRef.current?.focus()}
            blurOnSubmit={false}
          />

          <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ marginTop: spacing.xl, marginBottom: spacing.sm }}>
            {t('pin')}
          </Text>
          {/* Six boxes over one hidden input: big targets, digits never shown. */}
          <Pressable onPress={() => pinRef.current?.focus()} style={styles.pinRow} accessibilityLabel={t('pin')}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => {
              const filled = i < pin.length;
              const active = pinFocused && i === Math.min(pin.length, PIN_LENGTH - 1);
              return (
                <View
                  key={i}
                  style={[
                    styles.pinBox,
                    {
                      borderColor: active ? palette.primary : filled ? palette.outline : palette.outlineVariant,
                      borderWidth: active ? 2 : 1,
                      backgroundColor: filled ? palette.surfaceContainerLow : palette.surfaceContainerLowest,
                    },
                  ]}
                >
                  {filled ? <View style={[styles.pinDot, { backgroundColor: palette.onSurface }]} /> : null}
                </View>
              );
            })}
          </Pressable>
          <TextInput
            ref={pinRef}
            value={pin}
            onChangeText={(v) => {
              const next = v.replace(/\D/g, '').slice(0, PIN_LENGTH);
              setPin(next);
              setError(null);
              // The 6th digit signs in: no extra tap needed.
              if (next.length === PIN_LENGTH && readyWith(next)) void submit(next);
            }}
            onFocus={() => setPinFocused(true)}
            onBlur={() => setPinFocused(false)}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={PIN_LENGTH}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            caretHidden
            style={styles.hiddenInput}
          />
          <Text variant="labelMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.sm }}>
            {t('pinBoxesHint')}
          </Text>

          {error ? (
            <View style={[styles.error, { backgroundColor: palette.errorContainer }]}>
              <AlertCircle size={20} color={palette.onErrorContainer} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium" color={palette.onErrorContainer}>
                  {error.text}
                </Text>
                {error.detail ? (
                  <Text variant="labelMedium" color={palette.onErrorContainer} style={{ marginTop: 2, opacity: 0.8 }}>
                    {error.detail}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <View style={{ flex: 1, minHeight: spacing.xl }} />
          <Button
            label={busy ? t('signingIn') : t('signIn')}
            onPress={() => void submit()}
            disabled={busy || !ready}
            loading={busy}
            size="lg"
            fullWidth
            Icon={LogIn}
          />
          <View style={{ height: Math.max(insets.bottom, spacing.lg) }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  band: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl + spacing.lg },
  langRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  langSwitch: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  langBtn: { minWidth: 48, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  logo: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  brand: { fontSize: 40, lineHeight: 46, fontWeight: '800', letterSpacing: -1, marginTop: spacing.lg },
  sheet: {
    flex: 1,
    marginTop: -spacing.xxl,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  pinRow: { flexDirection: 'row', gap: spacing.sm },
  pinBox: { flex: 1, height: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pinDot: { width: 14, height: 14, borderRadius: 7 },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 14,
  },
});
