import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBar, Button, Chip, spacing, Text, TextField } from '../../../design';
import { useT } from '../../../i18n';
import type { StringKey } from '../../../i18n/strings';
import type { RootStackParamList } from '../../../navigation/types';
import { useTheme } from '../../../theme';
import { haptic } from '../../../utils/haptics';
import { visitorApi } from '../api';
import { StaffAvatar } from '../../../components/StaffAvatar';
import { rankByName } from '../../../utils/nameMatch';
import { useStaffDirectory } from '../staffDirectory';
import { queueVisitorEvent } from '../offline';

type Props = NativeStackScreenProps<RootStackParamList, 'WalkIn'>;

// Stored purposes stay canonical English (label-only translation).
const PURPOSES: Array<{ key: 'meeting' | 'interview' | 'delivery' | 'other'; label: StringKey; stored: string }> = [
  { key: 'meeting', label: 'purposeMeeting', stored: 'Meeting' },
  { key: 'interview', label: 'purposeInterview', stored: 'Interview' },
  { key: 'delivery', label: 'purposeDelivery', stored: 'Delivery' },
  { key: 'other', label: 'purposeOther', stored: 'Other' },
];

/**
 * A visitor with no pass. Meetings and interviews need a host, picked from
 * the staff list (saved on the phone so it works without internet).
 */
export function WalkInScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [purpose, setPurpose] = useState<(typeof PURPOSES)[number]['key']>('meeting');
  const [otherPurpose, setOtherPurpose] = useState('');
  const [host, setHost] = useState('');
  const [hostPicked, setHostPicked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const needsHost = purpose === 'meeting' || purpose === 'interview';

  // Staff directory on the phone (instant, offline). Matching forgives
  // typos, sound-alikes ("Juneyd" finds Junaid) and Hindi typing.
  const { index } = useStaffDirectory();
  const suggestions = useMemo(() => {
    if (hostPicked || host.trim().length < 2) return [];
    return rankByName(index, host.trim(), 5).map((m) => m.item);
  }, [index, host, hostPicked]);

  const submit = async () => {
    setError(null);
    setDone(null);
    const visitorName = name.trim();
    const chosen = PURPOSES.find((p) => p.key === purpose)!;
    const purposeText = purpose === 'other' ? otherPurpose.trim() : chosen.stored;
    const hostName = needsHost ? host.trim() : '';
    if (!visitorName) return setError(t('needVisitorName'));
    if (!purposeText) return setError(t('needPurpose'));
    if (needsHost && !hostName) return setError(t('needHost'));

    setSaving(true);
    const input = { visitor_name: visitorName, phone: phone.trim() || undefined, purpose: purposeText, host: hostName || undefined };
    const res = await visitorApi.manualEntry(input);
    setSaving(false);
    if (res.offline) {
      await queueVisitorEvent({
        eventType: 'manual_checkin',
        visitorName,
        phone: input.phone,
        purpose: purposeText,
        hostName: input.host,
      });
      setDone(t('savedForLater'));
    } else if (res.ok) {
      haptic.success();
      setDone(t('walkInDone', { name: visitorName }));
    } else {
      haptic.error();
      setError(res.data?.error ?? t('somethingWrong'));
      return;
    }
    // Ready for the next visitor; keep the purpose they were using.
    setName('');
    setPhone('');
    setOtherPurpose('');
    setHost('');
    setHostPicked(false);
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar title={t('walkIn')} onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TextField label={t('visitorNameField')} value={name} onChangeText={setName} autoCapitalize="words" />
          <View style={{ height: spacing.md }} />
          <TextField label={t('phoneOptional')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

          <Text variant="labelLarge" color={palette.onSurfaceVariant} style={styles.section}>
            {t('purposeLabel').toUpperCase()}
          </Text>
          <View style={styles.chips}>
            {PURPOSES.map((p) => (
              <Chip key={p.key} label={t(p.label)} selected={purpose === p.key} onPress={() => setPurpose(p.key)} />
            ))}
          </View>
          {purpose === 'other' ? (
            <View style={{ marginTop: spacing.md }}>
              <TextField label={t('purposeDetails')} value={otherPurpose} onChangeText={setOtherPurpose} />
            </View>
          ) : null}

          {needsHost ? (
            <View style={{ marginTop: spacing.lg }}>
              <TextField
                label={t('hostField')}
                helper={t('hostSearchHint')}
                value={host}
                onChangeText={(v) => {
                  setHost(v);
                  setHostPicked(false);
                }}
                clearable
              />
              {suggestions.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    setHost(s.name);
                    setHostPicked(true);
                  }}
                  style={({ pressed }) => [
                    styles.suggestion,
                    { backgroundColor: pressed ? palette.surfaceContainerHigh : palette.surfaceContainerLow },
                  ]}
                >
                  <StaffAvatar name={s.name} photoUrl={s.photoUrl} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyLarge">{s.name}</Text>
                    {s.department || s.role ? (
                      <Text variant="labelMedium" color={palette.onSurfaceVariant}>
                        {[s.role, s.department].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

          {error ? (
            <Text variant="bodyMedium" color={palette.error} style={{ marginTop: spacing.lg }}>
              {error}
            </Text>
          ) : null}
          {done ? (
            <Text variant="titleMedium" color={palette.primary} style={{ marginTop: spacing.lg }}>
              {done}
            </Text>
          ) : null}
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: palette.outlineVariant, backgroundColor: palette.surface }]}>
          <Button label={t('checkInNow')} onPress={() => void submit()} loading={saving} size="lg" fullWidth />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  section: { marginTop: spacing.xl, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    marginTop: spacing.xs,
  },
  footer: { padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
