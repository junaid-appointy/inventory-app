import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LogIn, LogOut } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBar, Button, ListRow, RowDivider, Skeleton, spacing, Text, TextField } from '../../../design';
import { useT } from '../../../i18n';
import type { RootStackParamList } from '../../../navigation/types';
import { useTheme } from '../../../theme';
import { haptic } from '../../../utils/haptics';
import { visitorApi, type StaffMember } from '../api';
import { StaffAvatar } from '../../../components/StaffAvatar';
import { rankByName } from '../../../utils/nameMatch';
import { useStaffDirectory } from '../staffDirectory';
import { timeOnly } from '../format';

type Props = NativeStackScreenProps<RootStackParamList, 'StaffInOut'>;

/**
 * Mark employees in and out at the gate. Online only, like the web portal:
 * the in/out state lives on the server and is shared by every gate.
 */
export function StaffInOutScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Everyone once (fresh, for today's in/out), then search on the phone:
  // instant, and it forgives typos, sound-alikes and Hindi typing.
  const { staff, setStaff, index, offline } = useStaffDirectory({ fresh: true });
  const shown = useMemo(() => {
    const q = query.trim();
    if (!q) return staff;
    const ranked = rankByName(index, q, 30).map((m) => m.item);
    // An employee code is matched exactly, as typed.
    const exact = (staff ?? []).filter((p) => p.employeeCode?.toLowerCase() === q.toLowerCase());
    return [...exact, ...ranked.filter((p) => !exact.includes(p))];
  }, [index, query, staff]);

  const toggle = useCallback(async (person: StaffMember) => {
    const goingIn = person.attendanceStatus !== 'in';
    setBusyId(person.id);
    const res = goingIn ? await visitorApi.markIn(person.id) : await visitorApi.markOut(person.id);
    setBusyId(null);
    if (res.offline) {
      setMessage({ text: t('needsInternet'), error: true });
      return;
    }
    if (!res.ok) {
      haptic.error();
      setMessage({ text: res.data?.error ?? t('somethingWrong'), error: true });
      return;
    }
    haptic.success();
    setMessage({ text: t(goingIn ? 'markedIn' : 'markedOut', { name: person.name }), error: false });
    // Show the change at once; the next visit to this screen reloads from the server.
    const now = new Date().toISOString();
    setStaff((cur) =>
      (cur ?? []).map((p) =>
        p.id === person.id
          ? { ...p, attendanceStatus: goingIn ? 'in' : 'out', ...(goingIn ? { markedInAt: now } : { markedOutAt: now }) }
          : p,
      ),
    );
  }, [setStaff, t]);

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar title={t('staffInOut')} onBack={() => navigation.goBack()} />
      <View style={styles.search}>
        <TextField label={t('searchStaff')} value={query} onChangeText={setQuery} clearable />
      </View>
      {offline && !message ? (
        <Text variant="bodyMedium" color={palette.error} style={styles.message}>
          {t('needsInternet')}
        </Text>
      ) : null}
      {message ? (
        <Text variant="bodyMedium" color={message.error ? palette.error : palette.primary} style={styles.message}>
          {message.text}
        </Text>
      ) : null}
      {staff === null ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={60} style={{ marginBottom: spacing.md, marginHorizontal: spacing.xl }} />
          ))}
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <RowDivider />}
          ListEmptyComponent={
            <Text variant="titleMedium" color={palette.onSurfaceVariant} style={styles.empty}>
              {t('noStaffFound')}
            </Text>
          }
          renderItem={({ item }) => {
            const inside = item.attendanceStatus === 'in';
            const when = inside ? item.markedInAt : item.markedOutAt;
            return (

                <ListRow
                  leading={<StaffAvatar name={item.name} photoUrl={item.photoUrl} size={44} />}
                  tone={inside ? 'success' : 'neutral'}
                  title={item.name}
                  subtitle={[item.employeeCode, when ? t(inside ? 'inAt' : 'outAt', { time: timeOnly(when) }) : null].filter(Boolean).join(' · ')}
                  trailing={
                    <Button
                      label={inside ? t('markOut') : t('markIn')}
                      onPress={() => void toggle(item)}
                      variant={inside ? 'tonal' : 'filled'}
                      size="sm"
                      loading={busyId === item.id}
                      Icon={inside ? LogOut : LogIn}
                    />
                  }
                />

            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  search: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  message: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  list: { paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  empty: { textAlign: 'center', marginTop: spacing.xxxl },
});
