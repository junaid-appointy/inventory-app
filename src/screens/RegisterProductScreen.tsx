import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppBar,
  Button,
  Chip,
  palette,
  spacing,
  Text,
  TextField,
} from '../design';
import { enqueue } from '../db/outbox';
import { upsertProduct } from '../db/products';
import { RootStackParamList } from '../navigation/types';
import { flushOnce } from '../sync/syncService';
import { haptic } from '../utils/haptics';

type Props = NativeStackScreenProps<RootStackParamList, 'RegisterProduct'>;

const CATEGORIES = ['Grocery', 'Cleaning', 'Office', 'Cafeteria', 'Other'];
const UNITS = ['Piece', 'Kg', 'Litre', 'Pack', 'Box'];

export function RegisterProductScreen({ route, navigation }: Props) {
  const { barcode } = route.params;
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Grocery');
  const [unit, setUnit] = useState('Piece');
  const [saving, setSaving] = useState(false);
  const canSave = name.trim().length > 0 && !saving;

  const onSave = async () => {
    if (!canSave) {
      haptic.warn();
      return;
    }
    setSaving(true);
    try {
      await upsertProduct({ barcode, name: name.trim(), category, unit });
      await enqueue('product_registration', { barcode, name: name.trim(), category, unit });
      flushOnce().catch(() => {});
      haptic.success();
      navigation.replace('Receiving', { barcode });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.safe}>
      <AppBar title="New product" subtitle={barcode} onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text variant="headlineMedium">What is this?</Text>
          <Text variant="bodyLarge" color={palette.onSurfaceVariant} style={{ marginTop: spacing.xs }}>
            Tell us once. We'll remember it next time you scan it.
          </Text>

          <View style={{ marginTop: spacing.xl }}>
            <TextField
              label="Product name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Tata Salt 1kg"
              autoFocus
              returnKeyType="done"
            />
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ marginBottom: spacing.sm }}>
              CATEGORY
            </Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((c) => (
                <Chip key={c} label={c} selected={c === category} onPress={() => setCategory(c)} />
              ))}
            </View>
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <Text variant="labelLarge" color={palette.onSurfaceVariant} style={{ marginBottom: spacing.sm }}>
              UNIT
            </Text>
            <View style={styles.chipRow}>
              {UNITS.map((u) => (
                <Chip key={u} label={u} selected={u === unit} onPress={() => setUnit(u)} />
              ))}
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label="Save & continue"
            onPress={onSave}
            disabled={!canSave}
            loading={saving}
            size="lg"
            fullWidth
          />
          <Button
            label="Cancel"
            variant="text"
            onPress={() => navigation.popToTop()}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: {
    padding: spacing.xl,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.outlineVariant,
  },
});
