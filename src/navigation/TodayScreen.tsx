import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HandCoins, Package, UserRound } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useCan } from '../auth';
import { getSession } from '../auth/session';
import { AttentionBanner } from '../components/AttentionBanner';
import { NavRow } from '../components/NavRow';
import { HubLayout } from '../components/shell/HubLayout';
import { rejectedCount, stuckCount } from '../db/outbox';
import { listLowOrOut } from '../db/stock';
import { spacing } from '../design';
import { useT } from '../i18n';
import { pullStockIntoCache } from '../sync/stockPull';
import { refetchThrottled } from '../sync/refetch';
import { flushOnce } from '../sync/syncService';
import type { RootStackParamList } from './types';

type Props = NativeStackScreenProps<RootStackParamList, 'Today'>;

function greetingKey(): 'goodMorning' | 'goodAfternoon' | 'goodEvening' {
  const h = new Date().getHours();
  return h < 12 ? 'goodMorning' : h < 17 ? 'goodAfternoon' : 'goodEvening';
}

/**
 * Home for people with more than one module (design 04): at most three
 * tasks and one amber line only when something needs them. Scanning lives
 * in the one Scan button in the bottom bar, not here.
 */
export function TodayScreen({ navigation }: Props) {
  const t = useT();
  const can = useCan();
  const [lowCount, setLowCount] = useState(0);
  const [problems, setProblems] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([rejectedCount(), stuckCount()]);
    setProblems(r + s);
    if (can('inventory.view')) {
      setLowCount((await listLowOrOut()).length);
      await refetchThrottled('stock', async () => {
        await flushOnce().catch(() => {});
        await pullStockIntoCache();
      });
      setLowCount((await listLowOrOut()).length);
    }
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

  const attention = lowCount + problems;

  return (
    <HubLayout title={t('tabToday')} eyebrow={`${t(greetingKey())}, ${getSession()?.guardName ?? ''}`} refreshing={refreshing} onRefresh={onRefresh}>
      <View style={{ gap: spacing.lg }}>
        {can('inventory.receive') ? (
          <NavRow Icon={Package} label={t('receiveAction')} onPress={() => navigation.navigate('Orders')} />
        ) : null}
        {can('visitor.checkin.create') ? (
          <NavRow Icon={UserRound} label={t('checkInVisitor')} onPress={() => navigation.navigate('GateHome')} />
        ) : null}
        {can('inventory.issue') ? (
          <NavRow Icon={HandCoins} label={t('takeOutAction')} onPress={() => navigation.navigate('Dispense')} />
        ) : null}
        {attention > 0 ? (
          <View style={{ marginTop: spacing.sm }}>
            <AttentionBanner
              text={attention === 1 ? t('itemNeedsAttention') : t('itemsNeedAttention', { n: attention })}
              onPress={() => navigation.navigate(lowCount > 0 ? 'Alerts' : 'Outbox')}
            />
          </View>
        ) : null}
      </View>
    </HubLayout>
  );
}
