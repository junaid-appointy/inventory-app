import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAuth } from '../../../auth';
import { AppBar, Button, Card, Chip, spacing, Text } from '../../../design';
import { useI18n } from '../../../i18n';
import type { Lang } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { useTheme, useThemeControls } from '../../../theme';
import type { ThemeName } from '../../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const LANG_OPTIONS: Array<{ value: Lang; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिंदी' },
  { value: 'icons', label: 'Icons' },
];

const THEME_OPTIONS: Array<{ value: ThemeName; label: string }> = [
  { value: 'steadyPurple', label: 'Steady' },
  { value: 'bold', label: 'Bold' },
];

export function SettingsScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const { themeName, setTheme } = useThemeControls();
  const { lang, setLang } = useI18n();
  const { session, logout } = useAuth();

  return (
    <View style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar title="Settings" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Section title="LANGUAGE">
          <View style={styles.chipRow}>
            {LANG_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                selected={lang === o.value}
                onPress={() => setLang(o.value)}
              />
            ))}
          </View>
          <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.sm }}>
            Icons-only mode hides text labels on tiles. Screen-reader strings stay in English.
          </Text>
        </Section>

        <Section title="THEME">
          <View style={styles.chipRow}>
            {THEME_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                selected={themeName === o.value}
                onPress={() => setTheme(o.value)}
              />
            ))}
          </View>
        </Section>

        {session && (
          <Section title="ACCOUNT">
            <Text variant="titleMedium">{session.guardName}</Text>
            <Text
              variant="bodyMedium"
              color={palette.onSurfaceVariant}
              style={{ marginTop: spacing.xs }}
            >
              Signed in · {session.language}
            </Text>
            <View style={{ marginTop: spacing.lg }}>
              <Button
                label="Sign out"
                variant="outlined"
                onPress={logout}
                size="md"
                fullWidth
              />
            </View>
          </Section>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <Text
        variant="labelLarge"
        color={palette.onSurfaceVariant}
        style={{ marginBottom: spacing.sm }}
      >
        {title}
      </Text>
      <Card tone="filled" padding="lg">
        {children}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
