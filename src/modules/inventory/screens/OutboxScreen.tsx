import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { AppBar, Button, Card, palette, Skeleton, spacing, StatusPill, Text } from '../../../design';
import { getDb } from '../../../db/database';
import { OutboxRow } from '../../../db/outbox';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { flushOnce } from '../../../sync/syncService';

type Props = NativeStackScreenProps<RootStackParamList, 'Outbox'>;

const KIND_LABEL: Record<string, string> = {
  receipt: 'Receipt',
  product_registration: 'Product mapping',
  issue: 'Issue',
  reorder_request: 'Reorder request',
  mismatch_flag: 'Mismatch flag',
};

const TONE: Record<OutboxRow['status'], 'success' | 'warn' | 'danger' | 'neutral'> = {
  sent: 'success',
  sending: 'warn',
  failed: 'danger',
  queued: 'neutral',
};

export function OutboxScreen({ navigation }: Props) {
  const t = useT();
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const load = useCallback(async () => {
    const db = await getDb();
    setRows(
      await db.getAllAsync<OutboxRow>(
        'SELECT * FROM outbox ORDER BY created_at DESC LIMIT 200'
      )
    );
    setInitialLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sync = async () => {
    setBusy(true);
    try {
      await flushOnce();
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.safe}>
      <AppBar title={t('syncQueue')} onBack={() => navigation.goBack()} />
      {initialLoading && rows.length === 0 ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ marginBottom: spacing.sm }}>
              <Card tone="filled" padding="lg">
                <View style={styles.rowHead}>
                  <Skeleton width="40%" height={18} />
                  <Skeleton width={64} height={20} rounded="pill" />
                </View>
                <View style={{ height: spacing.xs }} />
                <Skeleton width="65%" height={14} />
              </Card>
            </View>
          ))}
        </View>
      ) : (
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={sync} tintColor={palette.primary} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => (
          <Card tone="filled" padding="lg">
            <View style={styles.rowHead}>
              <Text variant="titleMedium">{KIND_LABEL[item.kind] ?? item.kind}</Text>
              <StatusPill label={item.status} tone={TONE[item.status]} />
            </View>
            <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.xs }}>
              {new Date(item.created_at).toLocaleString()} · {item.attempts} attempt
              {item.attempts === 1 ? '' : 's'}
            </Text>
            {item.last_error ? (
              <Text variant="bodyMedium" color={palette.error} style={{ marginTop: spacing.xs }}>
                {item.last_error}
              </Text>
            ) : null}
          </Card>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="headlineSmall" style={{ textAlign: 'center' }}>
              Nothing in the queue
            </Text>
            <Text
              variant="bodyLarge"
              color={palette.onSurfaceVariant}
              style={{ textAlign: 'center', marginTop: spacing.sm }}
            >
              Everything you've scanned has been sent.
            </Text>
          </View>
        }
      />
      )}
      <View style={styles.footer}>
        <Button label={t('syncNow')} onPress={sync} loading={busy} size="lg" fullWidth />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  empty: { padding: spacing.xxl },
  footer: {
    padding: spacing.xl,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.outlineVariant,
  },
});
