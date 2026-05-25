import React from 'react';
import { StyleProp, Text as RNText, TextProps, TextStyle } from 'react-native';
import { palette, type } from './tokens';

type Variant = keyof typeof type;

type Props = TextProps & {
  variant?: Variant;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
};

export function Text({ variant = 'bodyLarge', color = palette.onSurface, style, children, ...rest }: Props) {
  return (
    <RNText {...rest} style={[type[variant], { color }, style]}>
      {children}
    </RNText>
  );
}
