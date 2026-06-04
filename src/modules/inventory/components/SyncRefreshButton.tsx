import { RefreshCw } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useTheme } from '../../../theme';

type Props = {
  /** Returns a promise so the icon can spin until the sync resolves. */
  onPress: () => Promise<unknown>;
  /** Show a tiny red dot if the last completed sync ended in an error
   *  or a partial result. Cleared automatically on a successful sync. */
  stale: boolean;
};

/**
 * AppBar-corner Refresh icon. Rotates while a sync is in flight and
 * clears its "stale" red dot the moment a sync finishes without an
 * error. Stays consistent with the IconButton size used in AppBar
 * trailing slots elsewhere.
 */
export function SyncRefreshButton({ onPress, stale }: Props) {
  const { palette } = useTheme();
  const [running, setRunning] = useState(false);
  const [success, setSuccess] = useState(false); // dampens the red dot for a moment after success
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    if (running) {
      spin.setValue(0);
      loop = Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 800,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      loop.start();
    }
    return () => {
      loop?.stop();
    };
  }, [running, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const handlePress = async () => {
    if (running) return;
    setRunning(true);
    setSuccess(false);
    try {
      await onPress();
      setSuccess(true); // stale dot suppressed until next stale signal
    } catch {
      // leave success false → dot remains if backend still flaky
    } finally {
      setRunning(false);
    }
  };

  // Show dot if upstream says stale AND we haven't just successfully
  // synced (the success window resets only when stale flips false then
  // true again — i.e. a new failure).
  const showDot = stale && !success;

  return (
    <View>
      <Pressable
        onPress={handlePress}
        android_ripple={{ color: palette.outlineVariant, borderless: true, radius: 22 }}
        style={{
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View style={{ transform: [{ rotate }] }}>
          <RefreshCw size={22} color={palette.onSurface} strokeWidth={2.2} />
        </Animated.View>
      </Pressable>
      {showDot && (
        <View
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#dc2626',
            pointerEvents: 'none',
          }}
        />
      )}
    </View>
  );
}
