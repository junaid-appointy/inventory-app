import { ChevronDown, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { radius, spacing, Text } from '../../../design';
import { haptic } from '../../../utils/haptics';
import { useTheme } from '../../../theme';

export type FilterOption = {
  key: string;
  label: string;
};

type Props = {
  label: string;
  options: FilterOption[];
  selected: string;
  onSelect: (key: string) => void;
};

/**
 * A dropdown filter button that opens a bottom-sheet-style modal with options.
 * Compact trigger shows current selection with a chevron. Modal lists all
 * options with highlight on active item.
 */
export function FilterDropdown({ label, options, selected, onSelect }: Props) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === selected);

  const handleSelect = (key: string) => {
    haptic.tap();
    onSelect(key);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.trigger,
          {
            borderColor: selected !== 'All' ? palette.primary : palette.outlineVariant,
            backgroundColor: palette.surfaceContainerLowest,
          },
        ]}
      >
        <Text
          variant="labelLarge"
          color={selected !== 'All' ? palette.primary : palette.onSurface}
          numberOfLines={1}
        >
          {current?.label ?? label}
        </Text>
        <ChevronDown
          size={16}
          color={selected !== 'All' ? palette.primary : palette.onSurfaceVariant}
          strokeWidth={2.5}
        />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={[styles.sheet, { backgroundColor: palette.surface }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: palette.outlineVariant }]}>
              <Text variant="titleMedium">{label}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <X size={20} color={palette.onSurfaceVariant} strokeWidth={2} />
              </Pressable>
            </View>
            <ScrollView style={styles.optionsList} bounces={false}>
              {options.map((opt) => {
                const active = opt.key === selected;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => handleSelect(opt.key)}
                    style={[
                      styles.option,
                      active && { backgroundColor: `${palette.primary}14` },
                    ]}
                  >
                    <Text
                      variant="bodyLarge"
                      color={active ? palette.primary : palette.onSurface}
                      style={active ? { fontWeight: '600' } : undefined}
                    >
                      {opt.label}
                    </Text>
                    {active && (
                      <View style={[styles.activeDot, { backgroundColor: palette.primary }]} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '60%',
    paddingBottom: spacing.xxl,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  optionsList: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
