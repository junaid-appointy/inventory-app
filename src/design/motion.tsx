import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  type PressableProps,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import Reanimated, { Easing as REasing, FadeOut, Keyframe, LinearTransition } from 'react-native-reanimated';
import { motion } from './tokens';

/**
 * Small, quick motion shared by every screen: things answer the moment
 * they are touched and settle fast, so the app feels polished without
 * feeling slow (nothing runs longer than about a third of a second).
 *
 * - Press feedback, pops and progress bars use React Native's Animated on
 *   the native driver.
 * - Things that appear, disappear or move because the layout changed use
 *   Reanimated layout animations. (React Native's LayoutAnimation does
 *   nothing on Android's new architecture, which this app runs.)
 *
 * Everything is skipped when the phone's "remove animations" setting is on
 * (Reanimated follows the system setting by default).
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

// ─── Layout (Reanimated) ─────────────────────────────────────────

/** How a view slides to its new place or size when the layout changes. */
export const glide = LinearTransition.duration(motion.base).easing(REasing.out(REasing.cubic));

/** Fade and lift 8 px into place: for things that appear after a tap. */
export const liftIn = (delay = 0) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ translateY: 8 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }], easing: REasing.out(REasing.cubic) },
  })
    .duration(motion.base)
    .delay(delay);

/** Quick fade for things that go away. */
export const fadeAway = FadeOut.duration(motion.fast);

/**
 * A block that glides when the content above it grows or shrinks, and
 * (with `appear`) lifts in when it first shows and fades when it goes.
 */
export function Glide({
  children,
  appear,
  delay,
  style,
}: {
  children: React.ReactNode;
  appear?: boolean;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Reanimated.View
      layout={glide}
      entering={appear ? liftIn(delay) : undefined}
      exiting={appear ? fadeAway : undefined}
      style={style}
    >
      {children}
    </Reanimated.View>
  );
}

/** Lifts its children in when they first appear (no layout tracking). */
export function Appear({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Reanimated.View entering={liftIn(delay)} style={style}>
      {children}
    </Reanimated.View>
  );
}

// ─── Touch and value feedback (Animated, native driver) ─────────

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressScaleProps = Omit<PressableProps, 'style'> & {
  /** How small it gets while held. Big surfaces should shrink less. */
  to?: number;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
};

/** A Pressable that shrinks while held and springs back on release. */
export function PressScale({ to = 0.97, style, onPressIn, onPressOut, children, ...rest }: PressScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const resolved = typeof style === 'function' ? style({ pressed }) : style;
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        if (!reduceMotion) {
          Animated.timing(scale, { toValue: to, duration: 90, easing: easeOut, useNativeDriver: true }).start();
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        if (!reduceMotion) {
          Animated.spring(scale, { toValue: 1, speed: 28, bounciness: 7, useNativeDriver: true }).start();
        }
        onPressOut?.(e);
      }}
      style={[resolved, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * A scale that pops whenever `value` changes (not on first show): the
 * number a person just changed answers back.
 */
export function usePop(value: unknown, amount = 1.14): Animated.Value {
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduceMotion) return;
    scale.setValue(amount);
    Animated.spring(scale, { toValue: 1, speed: 24, bounciness: 9, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return scale;
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
