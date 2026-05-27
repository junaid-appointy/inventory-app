import { Check, RefreshCw } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { spacing, Text } from '../../../design';
import { onPendingChange } from '../../../sync/syncService';
import { useTheme } from '../../../theme';

export function QueueBadge() {
  const { palette } = useTheme();
  const [count, setCount] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    return onPendingChange((c) => setCount(c));
  }, []);

  // Pulse animation when items are pending
  useEffect(() => {
    if (count > 0) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [count, pulseAnim]);

  // All synced — just a tick icon, no text
  if (count === 0) {
    return (
      <View style={[styles.syncedRow, { backgroundColor: `${palette.primary}18` }]}>
        <Check size={16} color={palette.primary} strokeWidth={3} />
      </View>
    );
  }

  // Pending — pulsing dot + count
  return (
    <View style={styles.row}>
      <Animated.View style={[styles.dot, { opacity: pulseAnim, backgroundColor: palette.warn }]} />
      <Text variant="labelMedium" color={palette.onSurfaceVariant}>
        {count}
      </Text>
      <RefreshCw size={14} color={palette.onSurfaceVariant} strokeWidth={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  syncedRow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

