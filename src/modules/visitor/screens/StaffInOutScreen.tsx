import { recordGateEvent } from '../offline';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LogIn, LogOut } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBar, Button, ListRow, RowDivider, SectionHeader, Skeleton, radius, spacing, Text, TextField } from '../../../design';
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
type StaffFilter = 'all' | 'in' | 'out';

/** Save attendance locally before synchronizing the shared gate state. */
export function StaffInOutScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StaffFilter>('all');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const busy = useRef(false);
  const { staff, setStaff, index, unavailable, refreshing, reload } = useStaffDirectory({ fresh: true, paused: busyId !== null });
  const searching = query.trim().length > 0;
  const counts = { all: staff?.length ?? 0, in: staff?.filter((s) => s.attendanceStatus === 'in').length ?? 0 };
  const sections = useMemo(() => {
    const q = query.trim();
    const needle = q.toLowerCase();
    const direct = (staff ?? []).filter((p) => [p.employeeCode, p.department].some((v) => v?.toLowerCase().includes(needle)));
    const matched = q ? [...new Map([...direct, ...rankByName(index, q, 500).map((m) => m.item)].map((p) => [p.id, p])).values()] : staff ?? [];
    const alphabetical = [...matched].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return [
      { key: 'in', title: t('staffInside'), data: alphabetical.filter((p) => p.attendanceStatus === 'in') },
      { key: 'out', title: t('staffNotInside'), data: alphabetical.filter((p) => p.attendanceStatus !== 'in') },
    ].filter((s) => (searching || filter === 'all' || s.key === filter) && s.data.length > 0);
  }, [filter, index, query, searching, staff, t]);

  const toggle = useCallback(async (person: StaffMember) => {
    if (busy.current) return;
    busy.current = true;
    const goingIn = person.attendanceStatus !== 'in';
    setBusyId(person.id);
    try {
      const sent = await recordGateEvent({ eventType: goingIn ? 'staff_in' : 'staff_out', staffId: person.id, staffName: person.name });
      haptic.success();
      setMessage({ text: sent ? t(goingIn ? 'markedIn' : 'markedOut', { name: person.name }) : t('savedForLater'), error: false });
      const now = new Date().toISOString();
      setStaff((cur) => (cur ?? []).map((p) => p.id === person.id
        ? { ...p, attendanceStatus: goingIn ? 'in' : 'out', ...(goingIn ? { markedInAt: now } : { markedOutAt: now }) }
        : p));
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : t('somethingWrong'), error: true });
    } finally {
      busy.current = false;
      setBusyId(null);
    }
  }, [refreshing, setStaff, t, unavailable]);

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar title={t('staffInOut')} onBack={() => navigation.goBack()} />
      <View style={styles.search}>
        <TextField label={t('searchStaff')} value={query} onChangeText={(value) => { setQuery(value); setFilter('all'); }} clearable />
      </View>
      <View style={styles.filters} accessibilityRole="tablist">
        {(['all', 'in', 'out'] as const).map((key) => {
          const selected = filter === key;
          const count = key === 'out' ? counts.all - counts.in : counts[key];
          const label = t(key === 'all' ? 'staffAll' : key === 'in' ? 'staffInside' : 'staffNotInside');
          return <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled: searching }}
            accessibilityLabel={`${label} (${count})`}
            disabled={searching}
            onPress={() => setFilter(key)}
            style={({ pressed }) => [styles.filter, {
              backgroundColor: selected ? palette.secondaryContainer : palette.surface,
              borderColor: selected ? palette.secondary : palette.outlineVariant,
              opacity: pressed ? 0.8 : 1,
            }]}
          >
            <Text variant="labelLarge" color={selected ? palette.onSecondaryContainer : palette.onSurface}>{label}</Text>
            <Text variant="labelMedium" color={selected ? palette.onSecondaryContainer : palette.onSurfaceVariant}>{staff === null ? '—' : count}</Text>
          </Pressable>;
        })}
      </View>
      {searching ? <Text variant="labelMedium" color={palette.onSurfaceVariant} style={styles.message}>{t('staffSearchEveryone')}</Text> : null}
      {unavailable ? <View style={styles.warning}>
        <Text variant="bodyMedium" color={palette.error} style={{ flex: 1 }}>{t('staffStatusUnavailable')}</Text>
        <Button label={t('retry')} variant="text" size="sm" onPress={() => void reload()} loading={refreshing} />
      </View> : null}
      {message ? <Text variant="bodyMedium" color={message.error ? palette.error : palette.primary} style={styles.message} accessibilityLiveRegion="polite">{message.text}</Text> : null}
      {staff === null ? <View style={styles.list}>
        {[0, 1, 2].map((i) => <Skeleton key={i} height={60} style={{ marginBottom: spacing.md, marginHorizontal: spacing.xl }} />)}
      </View> : <SectionList
        sections={sections}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} tintColor={palette.primary} />}
        ItemSeparatorComponent={() => <RowDivider />}
        renderSectionHeader={({ section }) => <View style={{ backgroundColor: palette.background }}><SectionHeader title={`${section.title} (${section.data.length})`} /></View>}
        ListEmptyComponent={<Text variant="titleMedium" color={palette.onSurfaceVariant} style={styles.empty}>{t(searching ? 'noStaffFound' : filter === 'in' ? 'staffNoneInside' : filter === 'out' ? 'staffNoneOutside' : 'noStaffFound')}</Text>}
        renderItem={({ item }) => {
          const inside = item.attendanceStatus === 'in';
          const when = inside ? item.markedInAt : item.markedOutAt;
          return <ListRow
            leading={<StaffAvatar name={item.name} photoUrl={item.photoUrl} size={44} />}
            tone={inside ? 'success' : 'neutral'}
            title={item.name}
            subtitle={[item.employeeCode, when ? t(inside ? 'inAt' : 'outAt', { time: timeOnly(when) }) : t(inside ? 'staffInside' : 'staffNotInside')].filter(Boolean).join(' · ')}
            trailing={<Button label={inside ? t('markOut') : t('markIn')} onPress={() => void toggle(item)} variant={inside ? 'tonal' : 'filled'} size="sm" disabled={busyId !== null} loading={busyId === item.id} Icon={inside ? LogOut : LogIn} />}
          />;
        }}
      />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  search: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  filters: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  filter: { flex: 1, minHeight: 56, borderWidth: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  message: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  warning: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  list: { paddingBottom: spacing.xxxl },
  empty: { textAlign: 'center', marginTop: spacing.xxxl, paddingHorizontal: spacing.xl },
});
