import React from 'react';
import { StyleProp, Text as RNText, TextProps, TextStyle } from 'react-native';
import { useTheme } from '../theme';
import { type } from './tokens';

type Variant = keyof typeof type;

type Props = TextProps & {
  variant?: Variant;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
};

export function Text({ variant = 'bodyLarge', color, style, children, ...rest }: Props) {
  const { palette } = useTheme();
  return (
    <RNText {...rest} style={[type[variant], { color: color ?? palette.onSurface }, style]}>
      {children}
    </RNText>
  );
}
