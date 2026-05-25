import React, { useState } from 'react';
import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { Text } from './Text';
import { palette, radius, spacing, type as typo } from './tokens';

type Props = TextInputProps & {
  label: string;
  helper?: string;
  error?: string;
};

export function TextField({ label, helper, error, onFocus, onBlur, style, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const borderColor = error
    ? palette.error
    : focused
    ? palette.primary
    : palette.outlineVariant;
  return (
    <View>
      <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ marginBottom: spacing.xs }}>
        {label}
      </Text>
      <TextInput
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        placeholderTextColor={palette.onSurfaceVariant}
        style={[
          styles.input,
          typo.bodyLarge,
          { borderColor, color: palette.onSurface, borderWidth: focused ? 2 : 1.5 },
          style,
        ]}
      />
      {(error || helper) && (
        <Text
          variant="labelMedium"
          color={error ? palette.error : palette.onSurfaceVariant}
          style={{ marginTop: spacing.xs }}
        >
          {error ?? helper}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: palette.surfaceContainerLowest,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
  },
});
