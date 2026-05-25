import React from 'react';
import { StyleProp, View, ViewProps, ViewStyle } from 'react-native';
import { elevation as elev, palette, radius } from './tokens';

type Tone = 'low' | 'base' | 'high' | 'highest' | 'lowest';
type Level = keyof typeof elev;

const toneToColor: Record<Tone, string> = {
  lowest: palette.surfaceContainerLowest,
  low: palette.surfaceContainerLow,
  base: palette.surfaceContainer,
  high: palette.surfaceContainerHigh,
  highest: palette.surfaceContainerHighest,
};

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
  return (
    <View
      {...rest}
      style={[
        { backgroundColor: toneToColor[tone], borderRadius: radius[rounded] },
        elev[level],
        style,
      ]}
    >
      {children}
    </View>
  );
}
