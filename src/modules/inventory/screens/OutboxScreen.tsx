import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { AppBar, Button, Card, Skeleton, spacing, StatusPill, Text } from '../../../design';
import { getDb } from '../../../db/database';
import { OutboxRow } from '../../../db/outbox';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { flushOnce, getLastSyncAt } from '../../../sync/syncService';
import { useTheme } from '../../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Outbox'>;

const STATUS_LABEL: Record<string, string> = {
  queued: 'Waiting',
  sending: 'Sending…',
  failed: 'Failed',
};

const TONE: Record<string, 'warn' | 'danger' | 'neutral'> = {
  sending: 'warn',
  failed: 'danger',
  queued: 'neutral',
};

/** Parse payload JSON to produce a human-readable description */
function describeItem(kind: string, payloadStr: string): string {
  try {
    const p = JSON.parse(payloadStr);
    const name = p.product_name ?? p.name ?? '';
    const qty = p.qty ?? '';
    switch (kind) {
      case 'receipt':
        return `Received ${qty}× ${name}`.trim();
      case 'product_registration':
        return `New product: ${name}`.trim();
      case 'issue':
      case 'dispense':
        return `Dispensed ${qty}× ${name}`.trim();
      case 'reorder_request':
        return `Reorder: ${name}`.trim();
      case 'mismatch_flag':
        return `Mismatch: ${p.received_total ?? '?'} vs ${p.expected ?? '?'} expected`;
      default:
        return kind;
    }
  } catch {
    return kind;
  }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function OutboxScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const db = await getDb();

    // Delete all sent items immediately — only show what's pending
    await db.runAsync(`DELETE FROM outbox WHERE status = 'sent'`);

    setRows(
      await db.getAllAsync<OutboxRow>(
        `SELECT * FROM outbox WHERE status != 'sent'
         ORDER BY CASE status WHEN 'failed' THEN 0 WHEN 'sending' THEN 1 ELSE 2 END, created_at DESC
         LIMIT 200`,
      ),
    );
    setInitialLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const failedCount = useMemo(() => rows.filter((r) => r.status === 'failed').length, [rows]);

  const lastSyncAt = getLastSyncAt();

  const sync = async () => {
    setBusy(true);
    setSyncResult(null);
    try {
      const result = await flushOnce();
      await load();
      if (result.sent > 0 || result.failed > 0) {
        setSyncResult(`Synced ${result.sent} item${result.sent === 1 ? '' : 's'}${result.failed > 0 ? `, ${result.failed} failed` : ''}`);
      } else {
        setSyncResult('All synced ✓');
      }
    } catch {
      setSyncResult('Sync failed — check connection');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar title={t('syncQueue')} onBack={() => navigation.goBack()} />

      {/* Status bar */}
      <View style={styles.statusBar}>
        <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
          {rows.length === 0
            ? 'All synced ✓'
            : `${rows.length} item${rows.length === 1 ? '' : 's'} waiting`}
          {failedCount > 0 ? ` · ${failedCount} failed` : ''}
          {lastSyncAt ? `  ·  Last sync: ${timeAgo(lastSyncAt)}` : ''}
        </Text>
        {syncResult && (
          <Text
            variant="bodyMedium"
            color={failedCount > 0 ? palette.error : palette.primary}
          >
            {syncResult}
          </Text>
        )}
      </View>

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
              <Text variant="titleMedium" style={{ flex: 1 }}>
                {describeItem(item.kind, item.payload)}
              </Text>
              <StatusPill label={STATUS_LABEL[item.status] ?? item.status} tone={TONE[item.status] ?? 'neutral'} />
            </View>
            <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.xs }}>
              {timeAgo(item.created_at)}
              {item.attempts > 0 ? ` · ${item.attempts} attempt${item.attempts === 1 ? '' : 's'}` : ''}
            </Text>
            {item.last_error ? (
              <Text variant="bodyMedium" color={palette.error} style={{ marginTop: spacing.xs }} numberOfLines={2}>
                {item.last_error}
              </Text>
            ) : null}
          </Card>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="headlineSmall" style={{ textAlign: 'center' }}>
              All synced ✓
            </Text>
            <Text
              variant="bodyLarge"
              color={palette.onSurfaceVariant}
              style={{ textAlign: 'center', marginTop: spacing.sm }}
            >
              Everything has been sent to the server.
            </Text>
          </View>
        }
      />
      )}
      <View style={[styles.footer, { backgroundColor: palette.surface, borderTopColor: palette.outlineVariant }]}>
        <Button label={t('syncNow')} onPress={sync} loading={busy} size="lg" fullWidth />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  statusBar: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  list: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  empty: { padding: spacing.xxl },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
  },
});

