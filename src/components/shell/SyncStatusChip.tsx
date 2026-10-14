import { useFocusEffect } from '@react-navigation/native';
import { CloudOff } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { rejectedCount, stuckCount } from '../../db/outbox';
import { radius, spacing, Text } from '../../design';
import { useT } from '../../i18n';
import { isOnline, subscribeNetworkState } from '../../sync/networkState';
import { onPendingChange } from '../../sync/syncService';
import { useTheme } from '../../theme';

/**
 * The phone's own sync state as a glass chip on the header band, shown
 * only when there is something to know: amber waiting to send, red needs a
 * person (refused or stuck), grey offline. "All synced" is the normal state
 * and says nothing, so the chip is hidden then (user decision).
 */
export function SyncStatusChip() {
  const t = useT();
  const { palette } = useTheme();
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(0);
  const [problems, setProblems] = useState(0);

  useEffect(() => subscribeNetworkState(setOnline), []);
  useEffect(() => onPendingChange((n) => setPending(n)), []);
  useFocusEffect(
    useCallback(() => {
      void Promise.all([rejectedCount(), stuckCount()]).then(([r, s]) => setProblems(r + s));
    }, []),
  );

  if (online && problems === 0 && pending === 0) return null;

  // Bright dots so they read on the dark band.
  let dot = '#4ADE80';
  let label = t('syncAllGood');
  if (!online) {
    label = t('syncOfflineChip');
  } else if (problems > 0) {
    dot = '#F87171';
    label = t('syncProblemChip', { n: problems });
  } else if (pending > 0) {
    dot = '#FBBF24';
    label = t('syncWaiting', { n: pending });
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        alignSelf: 'flex-start',
        marginTop: spacing.md,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs + 2,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
      }}
    >
      {online ? (
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} />
      ) : (
        <CloudOff size={14} color={palette.onBand} />
      )}
      <Text variant="labelMedium" color={palette.onBand}>
        {label}
      </Text>
    </View>
  );
}
