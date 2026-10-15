import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LogOut } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCan } from '../../../auth';
import { AppBar, Button, ListRow, RowDivider, Skeleton, spacing, Text, TextField } from '../../../design';
import { useT } from '../../../i18n';
import type { RootStackParamList } from '../../../navigation/types';
import { useTheme } from '../../../theme';
import { haptic } from '../../../utils/haptics';
import { visitorApi, type VisitorSession } from '../api';
import { insideFor } from '../format';
import { VisitorWithHost } from '../../../components/StaffAvatar';
import { rankByAnyName } from '../../../utils/nameMatch';
import { queueVisitorEvent } from '../offline';

type Props = NativeStackScreenProps<RootStackParamList, 'OnSite'>;

/** Who is inside right now, with one button per person to mark them out. */
export function OnSiteScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const can = useCan();
  const [sessions, setSessions] = useState<VisitorSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await visitorApi.active();
    if (res.ok && res.data) {
      setSessions(res.data.sessions);
      setError(null);
    } else {
      // Keep whatever list we already show; just say it could not refresh.
      setError(res.offline ? t('needsInternet') : t('loadFailed'));
      setSessions((prev) => prev ?? []);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
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

  const markExit = useCallback(
    (s: VisitorSession) => {
      Alert.alert(t('exitConfirmTitle', { name: s.visitor_name }), undefined, [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('yesLeft'),
          style: 'destructive',
          onPress: async () => {
            const res = await visitorApi.checkOut(s.id);
            if (res.offline) {
              await queueVisitorEvent({
                eventType: 'checkout',
                sessionId: s.id,
                visitorName: s.visitor_name,
                checkoutTime: new Date().toISOString(),
              });
              setMessage(t('savedForLater'));
            } else if (res.ok && res.data?.success) {
              haptic.success();
              setMessage(t('exitDone', { name: s.visitor_name }));
            } else {
              haptic.error();
              setMessage(res.data?.errorMessage ?? t('somethingWrong'));
              return;
            }
            // Drop the row now; the next refresh confirms it.
            setSessions((prev) => (prev ?? []).filter((x) => x.id !== s.id));
          },
        },
      ]);
    },
    [t],
  );

  // By visitor or host name, forgiving typos and sound-alikes.
  const filtered = useMemo(() => {
    const q = query.trim();
    const list = sessions ?? [];
    if (!q) return list;
    return rankByAnyName(list, (s) => [s.visitor_name, s.host_employee_name], q);
  }, [query, sessions]);

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar title={t('onSite')} onBack={() => navigation.goBack()} />
      <View style={styles.search}>
        <TextField label={t('searchVisitors')} value={query} onChangeText={setQuery} clearable />
      </View>
      {message ? (
        <Text variant="bodyMedium" color={palette.primary} style={styles.message}>
          {message}
        </Text>
      ) : null}
      {error ? (
        <Text variant="bodyMedium" color={palette.error} style={styles.message}>
          {error}
        </Text>
      ) : null}
      {sessions === null ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={60} style={{ marginBottom: spacing.md, marginHorizontal: spacing.xl }} />
          ))}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />}
          ItemSeparatorComponent={() => <RowDivider />}
          ListEmptyComponent={
            <Text variant="titleMedium" color={palette.onSurfaceVariant} style={styles.empty}>
              {t('nobodyInside')}
            </Text>
          }
          renderItem={({ item }) => (

              <ListRow
                leading={<VisitorWithHost hostName={item.host_employee_name} hostPhotoUrl={item.host_photo_url} />}
                tone="neutral"
                title={item.visitor_name}
                subtitle={[item.host_employee_name, t('insideFor', { time: insideFor(item.checkin_time, t) })].filter(Boolean).join(' · ')}
                trailing={can('visitor.checkout.create') ? (
                  <Button label={t('markExit')} onPress={() => markExit(item)} variant="tonal" size="sm" Icon={LogOut} />
                ) : undefined}
              />

          )}
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
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: spacing.xxxl },
});
