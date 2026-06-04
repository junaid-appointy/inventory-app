import { X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';
import { radius, spacing, type as typo } from './tokens';

type Props = TextInputProps & {
  label: string;
  helper?: string;
  error?: string;
  /** When true (and the field has text), show a small ✕ button on the
   *  right that clears the input. Hidden by default to keep the chrome
   *  light for fields where clearing isn't useful. */
  clearable?: boolean;
};

export function TextField({ label, helper, error, onFocus, onBlur, style, clearable, value, onChangeText, ...rest }: Props) {
  const { palette } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error
    ? palette.error
    : focused
    ? palette.primary
    : palette.outlineVariant;
  const showClear = clearable && typeof value === 'string' && value.length > 0;
  return (
    <View>
      <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ marginBottom: spacing.xs }}>
        {label}
      </Text>
      <View style={{ position: 'relative' }}>
        <TextInput
          {...rest}
          value={value}
          onChangeText={onChangeText}
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
            {
              backgroundColor: palette.surfaceContainerLowest,
              borderColor,
              color: palette.onSurface,
              borderWidth: focused ? 2 : 1.5,
              paddingRight: showClear ? 44 : spacing.lg,
            },
            style,
          ]}
        />
        {showClear && (
          <Pressable
            onPress={() => onChangeText?.('')}
            hitSlop={10}
            style={{
              position: 'absolute',
              right: spacing.md,
              top: 0,
              bottom: 0,
              justifyContent: 'center',
            }}
          >
            <X size={20} color={palette.onSurfaceVariant} strokeWidth={2.2} />
          </Pressable>
        )}
      </View>
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
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
  },
});
