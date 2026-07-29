import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { AppBar, Button, Card, Skeleton, spacing, StatusPill, Text } from '../../../design';
import { getDb } from '../../../db/database';
import { INTERNAL_OUTBOX_KINDS, OutboxRow } from '../../../db/outbox';
import { useT } from '../../../i18n';
import { StringKey, TParams } from '../../../i18n/strings';
import { RootStackParamList } from '../../../navigation/types';
import { flushOnce, getLastSyncAt } from '../../../sync/syncService';
import { useTheme } from '../../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Outbox'>;

/** Translator function shape, threaded into the module-level helpers so
 *  their output follows the active language. */
type TFn = (key: StringKey, params?: TParams) => string;

const STATUS_LABEL_KEY: Record<string, StringKey> = {
  queued: 'statusWaiting',
  sending: 'statusSending',
  failed: 'statusFailed',
  applied_with_adjustment: 'statusAdjusted',
  superseded_by_count: 'statusCounted',
};

const TONE: Record<string, 'warn' | 'danger' | 'neutral'> = {
  sending: 'warn',
  failed: 'danger',
  queued: 'neutral',
  // An adjustment is information, not a failure. The guard did nothing
  // wrong: they recorded what happened and the system's number was off.
  applied_with_adjustment: 'warn',
  superseded_by_count: 'neutral',
};

/**
 * Statuses that need no telling. A write that landed exactly as recorded
 * is not news, so those rows are deleted on sight and the screen stays
 * empty in the normal case.
 */
const SILENT_STATUSES = ['sent', 'applied'] as const;

/** Parse payload JSON to produce a human-readable description */
function describeItem(kind: string, payloadStr: string, t: TFn): string {
  try {
    const p = JSON.parse(payloadStr);
    const name = p.product_name ?? p.name ?? '';
    const qty = p.qty ?? '';
    switch (kind) {
      case 'receipt':
        return t('descReceived', { qty, name }).trim();
      case 'product_registration':
        return t('descNewProduct', { name }).trim();
      case 'issue':
      case 'dispense':
        return t('descDispensed', { qty, name }).trim();
      case 'reorder_request':
        return t('descReorder', { name }).trim();
      case 'mismatch_flag':
        return t('descMismatch', { received: p.received_total ?? '?', expected: p.expected ?? '?' });
      default:
        return t('descInventoryUpdate');
    }
  } catch {
    return t('descInventoryUpdate');
  }
}

function timeAgo(ts: number, t: TFn): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t('justNow');
  if (minutes < 60) return t('minAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('hourAgo', { n: hours });
  return t('dayAgo', { n: Math.floor(hours / 24) });
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

    // Drop the rows with nothing to report. What survives is either
    // still in flight, stuck, or landed with something the user should
    // know — the adjusted ones stay until the queue is cleared.
    const silent = SILENT_STATUSES.map(() => '?').join(',');
    await db.runAsync(
      `DELETE FROM outbox WHERE status IN (${silent})`,
      SILENT_STATUSES as unknown as string[],
    );

    const hiddenList = INTERNAL_OUTBOX_KINDS.map(() => '?').join(',');
    setRows(
      await db.getAllAsync<OutboxRow>(
        `SELECT * FROM outbox
         WHERE status NOT IN (${silent}) AND kind NOT IN (${hiddenList})
         ORDER BY CASE status WHEN 'failed' THEN 0 WHEN 'sending' THEN 1 ELSE 2 END, created_at DESC
         LIMIT 200`,
        [...(SILENT_STATUSES as unknown as string[]), ...(INTERNAL_OUTBOX_KINDS as string[])],
      ),
    );
    setInitialLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const failedCount = useMemo(() => rows.filter((r) => r.status === 'failed').length, [rows]);

  const lastSyncAt = getLastSyncAt();

  const clearQueue = () => {
    if (rows.length === 0) return;
    Alert.alert(
      t('clearQueueConfirm'),
      t('clearQueueBody', { count: rows.length }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('clearBtn'),
          style: 'destructive',
          onPress: async () => {
            const db = await getDb();
            const silent = SILENT_STATUSES.map(() => '?').join(',');
            await db.runAsync(
              `DELETE FROM outbox WHERE status NOT IN (${silent})`,
              SILENT_STATUSES as unknown as string[],
            );
            await load();
            setSyncResult(t('queueCleared'));
          },
        },
      ],
    );
  };

  const sync = async () => {
    setBusy(true);
    setSyncResult(null);
    try {
      const result = await flushOnce();
      await load();
      if (result.sent > 0 || result.failed > 0) {
        setSyncResult(
          result.failed > 0
            ? t('syncedCountFailed', { sent: result.sent, failed: result.failed })
            : t('syncedCount', { sent: result.sent }),
        );
      } else {
        setSyncResult(t('allSynced'));
      }
    } catch {
      setSyncResult(t('syncFailedConn'));
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
            ? t('allSynced')
            : t('itemsWaiting', { count: rows.length })}
          {failedCount > 0 ? ` · ${t('nFailed', { count: failedCount })}` : ''}
          {lastSyncAt ? `  ·  ${t('lastSync', { time: timeAgo(lastSyncAt, t) })}` : ''}
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
                {describeItem(item.kind, item.payload, t)}
              </Text>
              <StatusPill
                label={STATUS_LABEL_KEY[item.status] ? t(STATUS_LABEL_KEY[item.status]) : item.status}
                tone={TONE[item.status] ?? 'neutral'}
              />
            </View>
            <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.xs }}>
              {timeAgo(item.created_at, t)}
              {item.attempts > 0 ? ` · ${t('nAttempts', { count: item.attempts })}` : ''}
            </Text>
            {/* The server's own sentence about what became of this row.
                One plain statement, never a question — if something needs
                a human it arrives as a recount task, not a prompt here. */}
            {item.server_note ? (
              <Text variant="bodyMedium" color={palette.onSurface} style={{ marginTop: spacing.xs }}>
                {item.server_note}
              </Text>
            ) : null}
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
              {t('allSynced')}
            </Text>
            <Text
              variant="bodyLarge"
              color={palette.onSurfaceVariant}
              style={{ textAlign: 'center', marginTop: spacing.sm }}
            >
              {t('everythingSent')}
            </Text>
          </View>
        }
      />
      )}
      <View style={[styles.footer, { backgroundColor: palette.surface, borderTopColor: palette.outlineVariant }]}>
        <Button label={t('syncNow')} onPress={sync} loading={busy} size="lg" fullWidth />
        {rows.length > 0 ? (
          <View style={{ height: spacing.sm }} />
        ) : null}
        {rows.length > 0 ? (
          <Button
            label={t('clearQueue')}
            onPress={clearQueue}
            variant="tonal"
            size="md"
            fullWidth
          />
        ) : null}
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

