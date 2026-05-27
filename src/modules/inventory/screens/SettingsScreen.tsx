import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAuth } from '../../../auth';
import { AppBar, Button, Card, Chip, spacing, Text } from '../../../design';
import { useI18n, useT } from '../../../i18n';
import type { Lang } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { useTheme, useThemeControls } from '../../../theme';
import type { ThemeName } from '../../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const LANG_OPTIONS: Array<{ value: Lang; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिंदी' },
];

export function SettingsScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const { themeName, setTheme } = useThemeControls();
  const { lang, setLang } = useI18n();
  const { session, logout } = useAuth();

  // Theme options use translated labels
  const themeOptions: Array<{ value: ThemeName; label: string }> = [
    { value: 'steadyPurple', label: t('themeLight') },
    { value: 'steadyPurpleDark', label: t('themeDark') },
  ];

  return (
    <View style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar title={t('settings')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Section title={t('langSection')}>
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
        </Section>

        <Section title={t('appearanceSection')}>
          <View style={styles.chipRow}>
            {themeOptions.map((o) => (
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
          <Section title={t('accountSection')}>
            <Text variant="titleMedium">{session.guardName}</Text>
            <Text
              variant="bodyMedium"
              color={palette.onSurfaceVariant}
              style={{ marginTop: spacing.xs }}
            >
              {t('signedIn')} · {session.language}
            </Text>
            <View style={{ marginTop: spacing.lg }}>
              <Button
                label={t('signOut')}
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

