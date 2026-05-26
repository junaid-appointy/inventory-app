import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { radius } from './tokens';

type Props = {
  height?: number;
  width?: number | `${number}%`;
  rounded?: keyof typeof radius;
  style?: StyleProp<ViewStyle>;
};

/**
 * Pulsing rectangle to stand in for content while it loads. Drop where
 * a real Text or row will be once data is available.
 */
export function Skeleton({ height = 16, width = '100%', rounded = 'sm', style }: Props) {
  const { palette } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.65] });

  return (
    <Animated.View
      style={[
        {
          height,
          width: width as any,
          borderRadius: radius[rounded],
          backgroundColor: palette.surfaceContainerHigh,
          opacity,
        },
        style,
      ]}
    />
  );
}
