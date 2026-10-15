import { RefreshCw, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Appear, PressScale, spacing, Text } from '../design';
import { useT } from '../i18n';
import { useTheme } from '../theme';
import { applyOta, useOtaPending } from './ota';

/**
 * A small card at the top when a new version has downloaded. It never
 * interrupts: tap to restart into it now, or close it and the update
 * applies the next time the app starts.
 */
export function UpdateBanner() {
  const t = useT();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const pending = useOtaPending();
  const [hidden, setHidden] = useState(false);
  if (!pending || hidden) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + spacing.sm }]}>
      <Appear>
        <View style={[styles.card, { backgroundColor: palette.onSurface }]}>
          <RefreshCw size={20} color={palette.surface} />
          <Text variant="bodyLarge" color={palette.surface} style={{ flex: 1, fontWeight: '600' }}>
            {t('updateReady')}
          </Text>
          <PressScale
            to={0.94}
            onPress={() => void applyOta()}
            accessibilityRole="button"
            style={[styles.action, { backgroundColor: palette.primaryContainer }]}
          >
            <Text variant="labelLarge" color={palette.onPrimaryContainer} style={{ fontWeight: '700' }}>
              {t('updateRestart')}
            </Text>
          </PressScale>
          <Pressable onPress={() => setHidden(true)} hitSlop={10} accessibilityLabel="Close">
            <X size={20} color={palette.surface} />
          </Pressable>
        </View>
      </Appear>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    borderRadius: 18,
    elevation: 6,
  },
  action: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999 },
});
