import { Minus, Plus } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { spacing, Text } from '../design';
import { useTheme } from '../theme';
import { haptic } from '../utils/haptics';

/**
 * One big whole-number amount with round − and + buttons either side. The
 * number itself is a field: tap it to type 48 instead of pressing + 47
 * times. Never goes below `min`.
 */
export function AmountStepper({
  value,
  onChange,
  min = 1,
  max,
  step = 1,
  unitLabel,
  compact,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  /** Never above this (e.g. what is in stock). */
  max?: number;
  /** How far one tap of − or + moves (e.g. 50 for grams). Typing is exact. */
  step?: number;
  /** Small word under the number, e.g. "packs". */
  unitLabel?: string;
  /** Smaller buttons and number, for one row in a list. */
  compact?: boolean;
}) {
  const { palette } = useTheme();
  const [draft, setDraft] = useState<string | null>(null);

  // Drop the typing buffer when the value changes from outside.
  useEffect(() => setDraft(null), [value]);

  const set = (n: number) => onChange(Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, Math.floor(n))));
  const bump = (d: number) => {
    haptic.tap();
    // Snap to the step grid so 230 g + 50 lands on 250, not 280.
    const next = d > 0 ? Math.floor(value / step) * step + step : Math.ceil(value / step) * step - step;
    set(next);
  };

  const btn = (Icon: typeof Minus, onPress: () => void, disabled: boolean, label: string) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: palette.primaryContainer, borderless: true }}
      style={[compact ? styles.btnSm : styles.btn, { backgroundColor: palette.surfaceContainerHigh, opacity: disabled ? 0.4 : 1 }]}
    >
      <Icon size={compact ? 20 : 26} color={palette.onSurface} strokeWidth={2.4} />
    </Pressable>
  );

  return (
    <View style={[styles.row, compact && { gap: spacing.sm }]}>
      {btn(Minus, () => bump(-1), value <= min, 'Less')}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <TextInput
          value={draft ?? String(value)}
          onChangeText={(txt) => setDraft(txt.replace(/\D/g, '').slice(0, 5))}
          onBlur={() => {
            if (draft !== null) set(draft === '' ? min : Number(draft));
            setDraft(null);
          }}
          onSubmitEditing={() => {
            if (draft !== null) set(draft === '' ? min : Number(draft));
          }}
          keyboardType="number-pad"
          selectTextOnFocus
          style={[compact ? styles.inputSm : styles.input, { color: palette.onSurface }]}
          accessibilityLabel={unitLabel}
        />
        {unitLabel ? (
          <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
            {unitLabel}
          </Text>
        ) : null}
      </View>
      {btn(Plus, () => bump(1), max !== undefined && value >= max, 'More')}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  btn: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  input: { fontSize: 48, lineHeight: 56, fontWeight: '800', textAlign: 'center', minWidth: 120, paddingVertical: 0 },
  btnSm: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  inputSm: { fontSize: 28, lineHeight: 34, fontWeight: '800', textAlign: 'center', minWidth: 56, paddingVertical: 0 },
});
