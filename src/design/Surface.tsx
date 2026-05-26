import React from 'react';
import { StyleProp, View, ViewProps, ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { elevation as elev, radius } from './tokens';

type Tone = 'low' | 'base' | 'high' | 'highest' | 'lowest';
type Level = keyof typeof elev;

type Props = ViewProps & {
  tone?: Tone;
  level?: Level;
  rounded?: keyof typeof radius;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function Surface({
  tone = 'lowest',
  level = 'level0',
  rounded = 'lg',
  style,
  children,
  ...rest
}: Props) {
  const { palette } = useTheme();
  const toneColor = {
    lowest: palette.surfaceContainerLowest,
    low: palette.surfaceContainerLow,
    base: palette.surfaceContainer,
    high: palette.surfaceContainerHigh,
    highest: palette.surfaceContainerHighest,
  }[tone];

  return (
    <View
      {...rest}
      style={[
        { backgroundColor: toneColor, borderRadius: radius[rounded] },
        elev[level],
        style,
      ]}
    >
      {children}
    </View>
  );
}
