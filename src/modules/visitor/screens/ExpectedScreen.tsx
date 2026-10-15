import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBar, ListRow, RowDivider, Skeleton, spacing, StatusChip, Text, TextField } from '../../../design';
import { useT } from '../../../i18n';
import type { RootStackParamList } from '../../../navigation/types';
import { useTheme } from '../../../theme';
import { visitorApi, type ExpectedGuest } from '../api';
import { readExpected, saveExpected } from '../cache';
import { timeOnly } from '../format';
import { VisitorWithHost } from '../../../components/StaffAvatar';
import { rankByAnyName } from '../../../utils/nameMatch';

type Props = NativeStackScreenProps<RootStackParamList, 'Expected'>;

/**
 * Today's guests with a pass. Saved on every load so the guard can still
 * look someone up (and match a scanned pass) with no internet.
 */
export function ExpectedScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const [guests, setGuests] = useState<ExpectedGuest[] | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const res = await visitorApi.expected();
    if (res.ok && res.data) {
      setGuests(res.data.guests);
      setSavedAt(res.data.generatedAt);
      setOffline(false);
      await saveExpected({ generatedAt: res.data.generatedAt, guests: res.data.guests });
      return;
    }
    const cached = await readExpected();
    setGuests(cached?.guests ?? []);
    setSavedAt(cached?.generatedAt ?? null);
    setOffline(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Show the saved copy instantly, then refresh over it.
      void readExpected().then((cached) => {
        if (cached) {
          setGuests((prev) => prev ?? cached.guests);
          setSavedAt((prev) => prev ?? cached.generatedAt);
        }
      });
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  // By visitor or host name, forgiving typos and sound-alikes; digits
  // find a phone number.
  const filtered = useMemo(() => {
    const q = query.trim();
    const list = guests ?? [];
    if (!q) return list;
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 3) return list.filter((g) => (g.visitorPhone ?? '').replace(/\D/g, '').includes(digits));
    return rankByAnyName(list, (g) => [g.visitorName, g.hostName], q);
  }, [guests, query]);

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar title={t('gateExpected')} onBack={() => navigation.goBack()} />
      <View style={styles.search}>
        <TextField label={t('searchExpected')} value={query} onChangeText={setQuery} clearable />
        <Text variant="labelMedium" color={offline ? palette.error : palette.onSurfaceVariant} style={{ marginTop: spacing.xs }}>
          {offline ? t('expectedOffline') : savedAt ? t('expectedSavedAt', { time: timeOnly(savedAt) }) : ''}
        </Text>
      </View>
      {guests === null ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={60} style={{ marginBottom: spacing.md, marginHorizontal: spacing.xl }} />
          ))}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
          ItemSeparatorComponent={() => <RowDivider />}
          ListEmptyComponent={
            <Text variant="titleMedium" color={palette.onSurfaceVariant} style={styles.empty}>
              {t('noExpected')}
            </Text>
          }
          renderItem={({ item }) => {
            const status = item.tokenUsed
              ? { label: t('statusInside'), tone: 'primary' as const }
              : item.approvalStatus === 'approved'
                ? { label: t('passApproved'), tone: 'success' as const }
                : item.approvalStatus === 'pending'
                  ? { label: t('passPending'), tone: 'warn' as const }
                  : { label: t('passExpired'), tone: 'danger' as const };
            return (

                <ListRow
                  leading={<VisitorWithHost hostName={item.hostName} hostPhotoUrl={item.hostPhotoUrl} />}
                  tone={item.tokenUsed ? 'primary' : 'info'}
                  title={item.visitorName}
                  subtitle={[item.hostName && `${t('hostLabel')}: ${item.hostName}`, item.expectedTime || timeOnly(item.validFrom)].filter(Boolean).join(' · ')}
                  trailing={<StatusChip label={status.label} tone={status.tone} />}
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
  list: { paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  empty: { textAlign: 'center', marginTop: spacing.xxxl },
});
