import { Minus, Plus, type LucideIcon } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '../theme';
import { haptic } from '../utils/haptics';
import { Text } from './Text';
import { spacing, type as typo } from './tokens';

type Props = {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  /** Allow fractional values (e.g. 0.5 kg). */
  decimal?: boolean;
  /**
   * Amount the +/- buttons move by. Defaults to 1. For continuous units
   * pass the unit's grid (e.g. 0.1 kg) so taps land on clean values
   * instead of jumping by a whole unit off a fractional floor (which
   * produced the 0.1 → 1.1 → 2.1 garbage).
   */
  step?: number;
};

/** Round to 3 decimals — the finest granularity the system tracks —
 *  so float dust (0.1 + 0.1 → 0.2, 0.3 → 0.30000000000000004) never
 *  reaches state or the display. */
const clean = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Big stepper for low-literacy users. Plus/minus circles flank a tappable
 * display: tapping the number swaps it for an inline TextInput so power
 * users can type the qty directly. Commits on blur or submit.
 */
export function QtyStepper({ value, onChange, min = 1, max, decimal = true, step = 1 }: Props) {
  const { palette } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(clean(value)));
  const inputRef = useRef<TextInput>(null);
  // Tracks the freshest value across closures. Without this, +/- tapped
  // right after an inline edit reads a stale `value` prop and the parent
  // sees its onChange clobbered by the trailing onBlur commit, which
  // looks to the user like the stepper has frozen.
  const liveValue = useRef(value);
  useEffect(() => { liveValue.current = value; });

  useEffect(() => {
    if (!editing) setDraft(String(clean(value)));
  }, [value, editing]);

  const clamp = (n: number) => {
    let out = n;
    if (Number.isNaN(out)) out = min;
    if (out < min) out = min;
    if (max !== undefined && out > max) out = max;
    return out;
  };

  const bump = (direction: number) => {
    haptic.tap();
    if (editing) {
      const parsed = clamp(parseValue(draft));
      if (!Number.isNaN(parsed)) liveValue.current = parsed;
      setDraft(String(liveValue.current));
      setEditing(false);
    }
    // `direction` is the sign (±1); `step` is the magnitude. Round the
    // result so a fractional step (0.1 kg) never accumulates float dust.
    const next = clamp(clean(liveValue.current + direction * step));
    liveValue.current = next;
    onChange(next);
  };

  const startEdit = () => {
    haptic.tap();
    setDraft(String(clean(value)));
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  /**
   * Propagate every keystroke to the parent so a submit handler that
   * fires before our `onBlur` (e.g. tapping a Confirm button) still sees
   * the latest qty. The local `draft` keeps the literal text so partial
   * states like "" don't snap the display while typing.
   */
  const parseValue = (text: string) => decimal ? parseFloat(text) : parseInt(text, 10);
  const validText = (text: string) =>
    decimal ? /^-?\d*\.?\d*$/.test(text) : /^-?\d*$/.test(text);

  const onTextChange = (text: string) => {
    if (!validText(text)) return; // reject stray characters
    setDraft(text);
    if (text.trim() === '' || text === '.' || text === '-') {
      // Don't push min on every backspace; wait for commit.
      return;
    }
    const parsed = parseValue(text);
    if (!Number.isNaN(parsed)) {
      const clamped = clamp(clean(parsed));
      liveValue.current = clamped;
      onChange(clamped);
    }
  };

  const commit = () => {
    // Guard: if bump() already exited edit mode, don't re-dispatch the
    // pre-bump draft over the bumped value.
    if (!editing) return;
    const next = clamp(clean(parseValue(draft)));
    liveValue.current = next;
    onChange(next);
    setDraft(String(next));
    setEditing(false);
  };

  return (
    <View style={styles.row}>
      <StepperButton Icon={Minus} onPress={() => bump(-1)} bg={palette.primary} fg={palette.onPrimary} ripple={palette.outlineVariant} />
      {editing ? (
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={onTextChange}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType={decimal ? "decimal-pad" : "number-pad"}
          selectTextOnFocus
          returnKeyType="done"
          style={[
            typo.displayLarge,
            styles.qtyText,
            { color: palette.onSurface, borderBottomColor: palette.primary },
          ]}
        />
      ) : (
        <Pressable
          onPress={startEdit}
          android_ripple={{ color: palette.outlineVariant, borderless: true }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text variant="displayLarge" style={styles.qtyText}>
            {clean(value)}
          </Text>
        </Pressable>
      )}
      <StepperButton Icon={Plus} onPress={() => bump(1)} bg={palette.primary} fg={palette.onPrimary} ripple={palette.outlineVariant} />
    </View>
  );
}

function StepperButton({
  Icon,
  onPress,
  bg,
  fg,
  ripple,
}: {
  Icon: LucideIcon;
  onPress: () => void;
  bg: string;
  fg: string;
  ripple: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: ripple, borderless: true, radius: 44 }}
      style={[styles.btn, { backgroundColor: bg }]}
    >
      <Icon size={40} color={fg} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  btn: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  qtyText: {
    minWidth: 120,
    textAlign: 'center',
    paddingBottom: 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
});
