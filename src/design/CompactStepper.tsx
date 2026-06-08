import { Minus, Plus } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { haptic } from '../utils/haptics';
import { Text } from './Text';
import { radius, spacing } from './tokens';

type Props = {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
};

/**
 * Row-sized qty stepper. Same +/- semantics as QtyStepper but built for
 * list rows in BatchEditor and LotPicker — 36 px buttons, fixed width
 * value cell, no `displayLarge` typography. Use the big QtyStepper for
 * hero "how many?" inputs; this one for "edit row N of M".
 */
export function CompactStepper({ value, onChange, min = 0, max }: Props) {
  const { palette } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const clamp = (n: number) => {
    let out = n;
    if (Number.isNaN(out)) out = min;
    if (out < min) out = min;
    if (max !== undefined && out > max) out = max;
    return out;
  };

  const bump = (delta: number) => {
    haptic.tap();
    onChange(clamp(value + delta));
  };

  const startEdit = () => {
    haptic.tap();
    setDraft(String(value));
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const commit = () => {
    const next = clamp(parseInt(draft, 10));
    onChange(next);
    setDraft(String(next));
    setEditing(false);
  };

  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => !atMin && bump(-1)}
        android_ripple={{ color: palette.outlineVariant, borderless: true, radius: 22 }}
        style={[
          styles.btn,
          {
            backgroundColor: atMin ? palette.surfaceContainerLow : palette.primary,
            opacity: atMin ? 0.5 : 1,
          },
        ]}
      >
        <Minus size={20} color={atMin ? palette.onSurfaceVariant : palette.onPrimary} strokeWidth={2.4} />
      </Pressable>

      {editing ? (
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={(t) => {
            if (!/^-?\d*$/.test(t)) return;
            setDraft(t);
            if (t.trim() === '' || t === '-') return;
            const parsed = parseInt(t, 10);
            if (!Number.isNaN(parsed)) onChange(clamp(parsed));
          }}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="number-pad"
          selectTextOnFocus
          returnKeyType="done"
          style={[styles.valueText, { color: palette.onSurface, borderBottomColor: palette.primary }]}
        />
      ) : (
        <Pressable onPress={startEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text variant="titleLarge" style={styles.valueText} color={palette.onSurface}>
            {value}
          </Text>
        </Pressable>
      )}

      <Pressable
        onPress={() => !atMax && bump(1)}
        android_ripple={{ color: palette.outlineVariant, borderless: true, radius: 22 }}
        style={[
          styles.btn,
          {
            backgroundColor: atMax ? palette.surfaceContainerLow : palette.primary,
            opacity: atMax ? 0.5 : 1,
          },
        ]}
      >
        <Plus size={20} color={atMax ? palette.onSurfaceVariant : palette.onPrimary} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  valueText: {
    minWidth: 36,
    textAlign: 'center',
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
});
