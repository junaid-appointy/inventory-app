import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { spacing } from './tokens';

/** Pulled down this far (px), or flicked down this fast, the sheet closes. */
const CLOSE_DISTANCE = 110;
const CLOSE_VELOCITY = 0.9;

/**
 * A sheet that rises from the bottom over a dimmed screen (design 02's item
 * sheet). Close it by dragging it down like a drawer, tapping outside, or
 * pressing Android back. Plain RN Modal + Animated + PanResponder, no extra
 * library, so it stays light on cheap phones.
 */
export function BottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const rise = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const sheetHeight = useRef(400);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!visible) return;
    drag.setValue(0);
    rise.setValue(0);
    Animated.timing(rise, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, rise, drag]);

  // Drag from the handle area to close. It claims the touch the moment a
  // finger lands on it: on Android's new architecture a touch nobody claimed
  // at the start never offers its moves to anyone, so "wait for a downward
  // move" never fired. Buttons in the sheet are outside this area and keep
  // working as before.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > CLOSE_DISTANCE || g.vy > CLOSE_VELOCITY) {
            Animated.timing(drag, {
              toValue: sheetHeight.current + 40,
              duration: 180,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }).start(() => closeRef.current());
          } else {
            Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
          }
        },
        onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [drag],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim }]} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.anchor} pointerEvents="box-none">
        <Animated.View
          onLayout={(e) => {
            sheetHeight.current = e.nativeEvent.layout.height;
          }}
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surfaceContainerLowest,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
              transform: [{ translateY: Animated.add(rise.interpolate({ inputRange: [0, 1], outputRange: [400, 0] }), drag) }],
            },
          ]}
        >
          <View
            {...pan.panHandlers}
            style={styles.grab}
            accessibilityRole="adjustable"
            accessibilityLabel="Drag down to close"
          >
            <View style={[styles.handle, { backgroundColor: palette.outlineVariant }]} />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: spacing.xs, paddingHorizontal: spacing.xl },
  // Much taller than the bar itself so a thumb finds it easily.
  grab: { alignSelf: 'stretch', alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.lg, marginTop: -spacing.xs },
  handle: { width: 40, height: 4, borderRadius: 2 },
});
