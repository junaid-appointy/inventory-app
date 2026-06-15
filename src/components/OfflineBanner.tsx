/**
 * Top connectivity banner.
 *
 * Two visual states:
 *   • Offline  → red bar, "Offline — showing saved data". Stays until
 *                connectivity returns.
 *   • Back online (transient) → green bar, "Back online". Auto-hides
 *                after a few seconds. Only appears as the transition
 *                from offline → online, not on steady-state online.
 *
 * The signal comes from `sync/networkState`, which combines:
 *   1. Recent successful API calls (strongest signal — beats the radio).
 *   2. `expo-network`'s probe + listener as a fallback.
 *
 * That fixes the previous bug where mid-range Android devices returned
 * `isConnected === undefined` and got stuck on the red banner forever.
 */

import { WifiOff, Wifi } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../design';
import { useT } from '../i18n';
import { useTheme } from '../theme';
import {
  isOnline as readIsOnline,
  startNetworkProbe,
  subscribeNetworkState,
} from '../sync/networkState';

const BACK_ONLINE_VISIBLE_MS = 2500;

export function OfflineBanner() {
  const t = useT();
  const { palette } = useTheme();
  const [online, setOnline] = useState<boolean>(readIsOnline());
  const [showBackOnline, setShowBackOnline] = useState(false);
  const prevOnline = useRef<boolean>(online);
  const backOnlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    startNetworkProbe();
    const unsub = subscribeNetworkState(setOnline);
    return () => {
      unsub();
      if (backOnlineTimer.current) clearTimeout(backOnlineTimer.current);
    };
  }, []);

  // Detect the offline → online transition and flash the green banner.
  useEffect(() => {
    const wasOffline = prevOnline.current === false;
    if (wasOffline && online) {
      setShowBackOnline(true);
      if (backOnlineTimer.current) clearTimeout(backOnlineTimer.current);
      backOnlineTimer.current = setTimeout(
        () => setShowBackOnline(false),
        BACK_ONLINE_VISIBLE_MS,
      );
    }
    prevOnline.current = online;
  }, [online]);

  if (!online) {
    return (
      <SafeAreaView edges={['top']} style={{ backgroundColor: palette.error }}>
        <View style={styles.bar}>
          <WifiOff size={16} color={palette.onError} strokeWidth={2.4} />
          <Text variant="labelLarge" color={palette.onError} style={{ marginLeft: 8 }}>
            {t('offlineBanner')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (showBackOnline) {
    // Reuse the warn palette as a soft "good" fallback if the theme
    // doesn't define an explicit success color. Looks distinct from the
    // red offline state without needing a new token. (Most themes here
    // use warm yellows; if you later add a `success` token, swap this in.)
    const successBg = (palette as { success?: string }).success ?? '#16A34A';
    const successFg = '#FFFFFF';
    return (
      <SafeAreaView edges={['top']} style={{ backgroundColor: successBg }}>
        <View style={styles.bar}>
          <Wifi size={16} color={successFg} strokeWidth={2.4} />
          <Text variant="labelLarge" color={successFg} style={{ marginLeft: 8 }}>
            {t('backOnline')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
});
