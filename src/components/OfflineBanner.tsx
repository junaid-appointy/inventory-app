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
 *
 * A third state wins over both: things recorded on this phone that are not
 * reaching the server (offline, or still waiting after STUCK_MS because
 * the server is down). The bar turns amber and opens the "Not sent yet"
 * list, where the person can forward them on WhatsApp. Normal sending is
 * quick and never shows it.
 */

import { ChevronRight, MessageCircle, WifiOff, Wifi } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../design';
import { useT } from '../i18n';
import { useTheme } from '../theme';
import {
  isOnline as readIsOnline,
  startNetworkProbe,
  subscribeNetworkState,
} from '../sync/networkState';
import { unsentSummary } from '../db/outbox';
import { onPendingChange } from '../sync/syncService';

const BACK_ONLINE_VISIBLE_MS = 2500;
/** Longer than a few 30 s sync rounds: by then the server is not taking them. */
const STUCK_MS = 90_000;

/** Rows waiting on this phone, re-read whenever the queue changes and every 20 s. */
function useWaiting(): { count: number; oldestAt: number | null } {
  const [summary, setSummary] = useState<{ count: number; oldestAt: number | null }>({ count: 0, oldestAt: null });
  useEffect(() => {
    const read = () => void unsentSummary().then(setSummary).catch(() => {});
    const off = onPendingChange(read);
    const timer = setInterval(read, 20_000);
    return () => {
      off();
      clearInterval(timer);
    };
  }, []);
  return summary;
}

export function OfflineBanner({ showUnsent, onUnsentPress }: { showUnsent: boolean; onUnsentPress: () => void }) {
  const t = useT();
  const { palette } = useTheme();
  const waiting = useWaiting();
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

  const stuck =
    waiting.count > 0 &&
    (!online || (waiting.oldestAt !== null && Date.now() - waiting.oldestAt > STUCK_MS));
  if (showUnsent && stuck) {
    return (
      <SafeAreaView edges={['top']} style={{ backgroundColor: palette.warnContainer }}>
        <Pressable onPress={onUnsentPress} accessibilityRole="button" style={[styles.bar, styles.tall]}>
          <MessageCircle size={18} color={palette.onWarnContainer} strokeWidth={2.4} />
          <Text variant="labelLarge" color={palette.onWarnContainer} style={{ marginLeft: 8, flexShrink: 1, fontWeight: '700' }}>
            {t('unsentBanner', { n: waiting.count })}
          </Text>
          <ChevronRight size={18} color={palette.onWarnContainer} />
        </Pressable>
      </SafeAreaView>
    );
  }

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
  // Big enough to tap with a thumb.
  tall: { paddingVertical: 12 },
});
