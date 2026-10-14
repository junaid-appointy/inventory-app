import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  LayoutAnimation,
  Pressable,
  type PressableProps,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import { motion } from './tokens';

/**
 * Small, quick motion shared by every screen: things respond the moment
 * they are touched and settle fast, so the app feels polished without
 * feeling slow. Everything runs on the native driver (transform and
 * opacity only) and is skipped when the phone's "remove animations"
 * setting is on.
 */

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => {
    reduceMotion = v;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
  reduceMotion = v;
});

const easeOut = Easing.out(Easing.cubic);

/**
 * Animate the next layout change: rows opening, a card appearing, a line
 * of text being added. Call it right before the state update.
 */
export function animateNextLayout(duration: number = motion.base): void {
  if (reduceMotion) return;
  LayoutAnimation.configureNext(
    LayoutAnimation.create(duration, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressScaleProps = Omit<PressableProps, 'style'> & {
  /** How small it gets while held. Big surfaces should shrink less. */
  to?: number;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
};

/** A Pressable that shrinks a little while held, like the buttons. */
export function PressScale({ to = 0.98, style, onPressIn, onPressOut, children, ...rest }: PressScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const go = (v: number) => {
    if (reduceMotion) return;
    Animated.timing(scale, { toValue: v, duration: motion.fast, easing: easeOut, useNativeDriver: true }).start();
  };
  const resolved = typeof style === 'function' ? style({ pressed }) : style;
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        go(to);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        go(1);
        onPressOut?.(e);
      }}
      style={[resolved, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * A scale that pops briefly whenever `value` changes (not on first show):
 * the number a person just changed answers back.
 */
export function usePop(value: unknown, amount = 1.08): Animated.Value {
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduceMotion) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: amount, duration: 70, easing: easeOut, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: motion.fast, easing: easeOut, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return scale;
}

/** Fades and lifts its children in when they first appear. */
export function Appear({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(v, { toValue: 1, duration: motion.base, delay, easing: easeOut, useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A progress bar that glides to its new value. The fill slides in rather
 * than stretching, so its rounded end stays round at any value.
 */
export function ProgressBar({
  fill,
  color,
  track,
  height = 8,
}: {
  /** 0..1 */
  fill: number;
  color: string;
  track: string;
  height?: number;
}) {
  const target = Math.max(0, Math.min(1, fill));
  const v = useRef(new Animated.Value(reduceMotion ? target : 0)).current;
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (reduceMotion) {
      v.setValue(target);
      return;
    }
    Animated.timing(v, { toValue: target, duration: motion.slow, easing: easeOut, useNativeDriver: true }).start();
  }, [target, v]);
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}
    >
      {width > 0 ? (
        <Animated.View
          style={{
            width,
            height,
            borderRadius: height / 2,
            backgroundColor: color,
            transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] }) }],
          }}
        />
      ) : null}
    </View>
  );
}
