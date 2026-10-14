import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Footprints, UserRoundCheck, Users } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useCan } from '../../../auth';
import { HubLayout } from '../../../components/shell/HubLayout';
import { ListRow, RowDivider, SectionHeader, spacing, StatusChip, Text } from '../../../design';
import { useT } from '../../../i18n';
import type { RootStackParamList } from '../../../navigation/types';
import { useTheme } from '../../../theme';
import { visitorApi, type ExpectedGuest } from '../api';
import { readExpected, saveExpected } from '../cache';
import { timeOnly } from '../format';

type Props = NativeStackScreenProps<RootStackParamList, 'GateHome'>;

const SHOWN = 4;

/**
 * Visitors hub (design 06): who is coming, and three plain rows for
 * everything else a guard does. Passes are scanned with the bottom bar's
 * Scan button, which says "Scan pass" on this page.
 */
export function GateHomeScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const can = useCan();
  const [expected, setExpected] = useState<ExpectedGuest[] | undefined>();
  const [inside, setInside] = useState<number | undefined>();
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const jobs: Promise<unknown>[] = [];
    if (can('visitor.dashboard.view')) {
      jobs.push(visitorApi.active().then((res) => res.ok && res.data && setInside(res.data.sessions.length)));
    }
    if (can('visitor.expected.view')) {
      jobs.push(
        visitorApi.expected().then(async (res) => {
          if (res.ok && res.data) {
            setExpected(res.data.guests);
            // Refresh the offline copy every time we are online anyway.
            void saveExpected({ generatedAt: res.data.generatedAt, guests: res.data.guests });
          } else {
            setExpected((await readExpected())?.guests ?? []);
          }
        }),
      );
    }
    await Promise.allSettled(jobs);
  }, [can]);

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

  const upcoming = (expected ?? []).filter((g) => !g.tokenUsed).slice(0, SHOWN);

  return (
    <HubLayout title={t('tabVisitors')} refreshing={refreshing} onRefresh={onRefresh}>

      {can('visitor.expected.view') ? (
        <>
          <SectionHeader title={t('expectedNow')} actionLabel={expected && expected.length > SHOWN ? t('viewAll') : undefined} onAction={() => navigation.navigate('Expected')} />
          {upcoming.length === 0 ? (
            <Text variant="bodyLarge" color={palette.onSurfaceVariant} style={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.md }}>
              {expected === undefined ? ' ' : t('noExpected')}
            </Text>
          ) : (
            upcoming.map((g, i) => (
              <View key={g.id}>
                {i > 0 ? <RowDivider /> : null}
                <ListRow
                  title={g.visitorName}
                  subtitle={g.hostName ?? null}
                  trailing={g.approvalStatus === 'pending'
                    ? <StatusChip label={t('passPending')} tone="warn" />
                    : g.expectedTime || timeOnly(g.validFrom)}
                  onPress={() => navigation.navigate('Expected')}
                />
              </View>
            ))
          )}
        </>
      ) : null}

      <View style={{ marginTop: spacing.xl }}>
        {can('visitor.manual.create') ? (
          <>
            <RowDivider />
            <ListRow Icon={Footprints} title={t('walkInCheckIn')} onPress={() => navigation.navigate('WalkIn')} />
          </>
        ) : null}
        {can('visitor.dashboard.view') ? (
          <>
            <RowDivider />
            <ListRow Icon={Users} title={t('onSite')} trailing={inside !== undefined ? String(inside) : undefined} onPress={() => navigation.navigate('OnSite')} />
          </>
        ) : null}
        {can('visitor.staff.mark') ? (
          <>
            <RowDivider />
            <ListRow Icon={UserRoundCheck} title={t('staffInOut')} onPress={() => navigation.navigate('StaffInOut')} />
          </>
        ) : null}
        <RowDivider />
      </View>
    </HubLayout>
  );
}
