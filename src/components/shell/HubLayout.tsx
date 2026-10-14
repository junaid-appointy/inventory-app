import { useFocusEffect } from '@react-navigation/native';
import { setStatusBarStyle } from 'expo-status-bar';
import React, { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, Text } from '../../design';
import { useTheme, useThemeControls } from '../../theme';
import { BottomBar } from './BottomBar';
import { SyncStatusChip } from './SyncStatusChip';

/**
 * Hub screen frame: a deep plum header band (small greeting, big title,
 * sync chip), a white sheet with rounded top corners that overlaps it and
 * holds the simple body, an optional pinned action, and the bottom bar.
 */
export function HubLayout({
  title,
  eyebrow,
  refreshing,
  onRefresh,
  children,
  footer,
}: {
  title: string;
  /** Small line above the title (e.g. "Good morning, Sana"). */
  eyebrow?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  children: React.ReactNode;
  /** Pinned above the bottom bar (e.g. "Scan item"). */
  footer?: React.ReactNode;
}) {
  const { palette } = useTheme();
  const { themeName } = useThemeControls();
  const insets = useSafeAreaInsets();

  // Light status-bar icons over the band; back to the theme default when a
  // detail screen (light AppBar) covers this one.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle(themeName === 'steadyPurpleDark' ? 'light' : 'dark');
    }, [themeName]),
  );

  return (
    <View style={[styles.root, { backgroundColor: palette.band }]}>
      <ScrollView
        style={{ backgroundColor: palette.background }}
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={palette.primary} progressViewOffset={insets.top} />
          ) : undefined
        }
      >
        <View style={[styles.band, { backgroundColor: palette.band, paddingTop: insets.top + spacing.lg }]}>
          {eyebrow ? (
            <Text variant="bodyLarge" color={palette.onBandMuted}>
              {eyebrow}
            </Text>
          ) : null}
          <Text style={[styles.title, { color: palette.onBand }]} numberOfLines={1} adjustsFontSizeToFit>
            {title}
          </Text>
          <SyncStatusChip />
        </View>
        <View style={[styles.sheet, { backgroundColor: palette.background }]}>{children}</View>
      </ScrollView>
      {footer ? <View style={[styles.footer, { backgroundColor: palette.background }]}>{footer}</View> : null}
      <BottomBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  band: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl + spacing.lg },
  title: { fontSize: 36, lineHeight: 42, fontWeight: '800', letterSpacing: -0.8 },
  sheet: {
    marginTop: -spacing.xxl,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: spacing.xl,
  },
  footer: { paddingVertical: spacing.md },
});
