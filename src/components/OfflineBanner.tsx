/**
 * Global "Offline — showing saved data" banner.
 *
 * Mounted once above the navigator in `RootNavigator`. Shows whenever
 * `Network.getNetworkStateAsync().isConnected === false`, hides as soon
 * as connectivity returns. Stays out of the way otherwise (zero height
 * when online — no layout shift).
 *
 * We listen via `addNetworkStateListener` rather than polling so the
 * banner appears within ~1 s of the radio losing signal. As a safety
 * net we also poll once on mount because the OS event isn't guaranteed
 * to fire on cold start.
 */

import { WifiOff } from 'lucide-react-native';
import * as Network from 'expo-network';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../design';
import { useT } from '../i18n';
import { useTheme } from '../theme';

export function OfflineBanner() {
  const t = useT();
  const { palette } = useTheme();
  const [offline, setOffline] = useState<boolean>(false);

  useEffect(() => {
    let unsubscribe: { remove: () => void } | null = null;

    // One initial probe so we don't miss the "boot offline" case (the
    // event listener only fires on transitions).
    Network.getNetworkStateAsync()
      .then((s) => setOffline(!s.isConnected))
      .catch(() => {});

    try {
      unsubscribe = Network.addNetworkStateListener((state) => {
        setOffline(!state.isConnected);
      });
    } catch {
      // Older expo-network builds may not have the listener API; the
      // initial probe + the per-request 401 path are good enough.
    }

    return () => {
      if (unsubscribe) {
        try { unsubscribe.remove(); } catch { /* swallow */ }
      }
    };
  }, []);

  if (!offline) return null;

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

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
});
