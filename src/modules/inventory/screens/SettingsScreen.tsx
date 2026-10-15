import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CloudOff, Download, Languages, LogOut, Palette as PaletteIcon, RefreshCw, UserRound } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../../../auth';
import { HubLayout } from '../../../components/shell/HubLayout';
import { adjustedCount, rejectedCount, stuckCount } from '../../../db/outbox';
import { Chip, ListRow, RowDivider, spacing, Text } from '../../../design';
import { useI18n, useT } from '../../../i18n';
import type { Lang } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { useTheme, useThemeControls } from '../../../theme';
import { checkForOta, otaEnabled, type OtaResult, runningVersion } from '../../../updates/ota';
import appConfig from '../../../../app.json';
import type { ThemeName } from '../../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const LANG_OPTIONS: Array<{ value: Lang; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिंदी' },
];

/**
 * "More": the app's own settings, reachable from every module's bottom bar.
 * Sync only appears loud when something actually needs a person.
 */
export function SettingsScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const { themeName, setTheme } = useThemeControls();
  const { lang, setLang } = useI18n();
  const { session, logout } = useAuth();

  // Count only what a person might act on: writes that keep failing, writes
  // the server adjusted, and writes the server refused. A plain backlog
  // drains by itself, so it deliberately shows nothing.
  const [needsAttention, setNeedsAttention] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const [stuck, adjusted, rejected] = await Promise.all([stuckCount(), adjustedCount(), rejectedCount()]);
      if (!cancelled) setNeedsAttention(stuck + adjusted + rejected);
    };
    void check();
    const unsub = navigation.addListener('focus', () => { void check(); });
    return () => { cancelled = true; unsub(); };
  }, [navigation]);

  // Version, and a manual "check now" for when someone is told a fix is out.
  const [otaState, setOtaState] = useState<OtaResult | 'checking' | null>(null);
  const version = runningVersion(appConfig.expo.version);
  const otaLine =
    !otaEnabled ? t('updateDevBuild')
      : otaState === 'checking' ? t('updateChecking')
        : otaState === 'downloaded' ? t('updateDownloaded')
          : otaState === 'latest' ? t('updateLatest')
            : otaState === 'offline' ? t('updateOffline')
              : t('appVersion', { v: version });
  const checkNow = async () => {
    if (!otaEnabled || otaState === 'checking') return;
    setOtaState('checking');
    setOtaState(await checkForOta(true));
  };

  const themeOptions: Array<{ value: ThemeName; label: string }> = [
    { value: 'steadyPurple', label: t('themeLight') },
    { value: 'steadyPurpleDark', label: t('themeDark') },
  ];

  return (
    <HubLayout title={t('moreTitle')}>
      {session ? (
        <ListRow Icon={UserRound} title={session.guardName} subtitle={t('signedIn')} />
      ) : null}
      <RowDivider />
      <ListRow
        Icon={needsAttention > 0 ? CloudOff : RefreshCw}
        tone={needsAttention > 0 ? 'danger' : 'neutral'}
        title={t('syncQueue')}
        subtitle={needsAttention > 0 ? t('syncNeedsAttention', { n: needsAttention }) : t('syncAllClear')}
        onPress={() => navigation.navigate('Outbox')}
      />
      <RowDivider />
      <ChoiceRow Icon={Languages}>
        {LANG_OPTIONS.map((o) => (
          <Chip key={o.value} label={o.label} selected={lang === o.value} onPress={() => setLang(o.value)} />
        ))}
      </ChoiceRow>
      <RowDivider />
      <ChoiceRow Icon={PaletteIcon}>
        {themeOptions.map((o) => (
          <Chip key={o.value} label={o.label} selected={themeName === o.value} onPress={() => setTheme(o.value)} />
        ))}
      </ChoiceRow>
      <RowDivider />
      <ListRow
        Icon={Download}
        tone={otaState === 'offline' ? 'warn' : 'neutral'}
        title={t('updateCheck')}
        subtitle={otaLine}
        onPress={otaEnabled ? () => void checkNow() : undefined}
        showChevron={false}
      />
      <RowDivider />
      {session ? (
        <>
          <ListRow Icon={LogOut} tone="danger" title={t('signOut')} onPress={() => void logout()} showChevron={false} />
          <RowDivider />
        </>
      ) : null}
      <Text variant="labelMedium" color={palette.onSurfaceVariant} style={{ textAlign: 'center', marginTop: spacing.xxl }}>
        {t('appName')} · {t('appVersion', { v: version })}
      </Text>
    </HubLayout>
  );
}

function ChoiceRow({ Icon, children }: { Icon: typeof Languages; children: React.ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={styles.choice}>
      <Icon size={26} color={palette.onSurfaceVariant} strokeWidth={1.8} />
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  choice: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, minHeight: 68, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
