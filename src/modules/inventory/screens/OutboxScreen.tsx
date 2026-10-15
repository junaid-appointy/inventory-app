import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CheckCheck, CheckCircle2, Circle, CircleCheckBig, MessageCircle } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, Share, StyleSheet, View } from 'react-native';
import { AppBar, Button, ListRow, RowDivider, SectionHeader, Skeleton, spacing, Text } from '../../../design';
import { getDb } from '../../../db/database';
import { INTERNAL_OUTBOX_KINDS, markShared, OutboxRow, requeueRejected, UNSENT_STATUSES } from '../../../db/outbox';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { flushOnce, onPendingChange } from '../../../sync/syncService';
import { describeRow, isShareable, rowTime, shareText } from '../../../sync/unsent';
import { useTheme } from '../../../theme';
import { haptic } from '../../../utils/haptics';

type Props = NativeStackScreenProps<RootStackParamList, 'Outbox'>;

/**
 * Statuses that need no telling. A write that landed exactly as recorded
 * is not news, so those rows are deleted on sight and the screen stays
 * empty in the normal case.
 */
const SILENT_STATUSES = ['sent', 'applied'] as const;

/**
 * "Not sent yet": everything saved on this phone that the server has not
 * taken, in one plain list. When the server cannot be reached the person
 * ticks what to tell the office and forwards it on WhatsApp, the same way
 * they forward any message. The rows still go to the server by themselves
 * when it is back, and then leave this list.
 *
 * Below them, rows the server took with a note worth reading (a count was
 * corrected, a staff mark needs a look), until the person leaves.
 */
export function OutboxScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const [unsent, setUnsent] = useState<OutboxRow[]>([]);
  const [noted, setNoted] = useState<OutboxRow[]>([]);
  // Unticked by the person; everything else not yet shared is ticked.
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    const silent = SILENT_STATUSES.map(() => '?').join(',');
    await db.runAsync(`DELETE FROM outbox WHERE status IN (${silent})`, SILENT_STATUSES as unknown as string[]);
    const hidden = INTERNAL_OUTBOX_KINDS.map(() => '?').join(',');
    const rows = await db.getAllAsync<OutboxRow>(
      `SELECT * FROM outbox WHERE status NOT IN (${silent}) AND kind NOT IN (${hidden})
       ORDER BY created_at DESC LIMIT 200`,
      [...(SILENT_STATUSES as unknown as string[]), ...(INTERNAL_OUTBOX_KINDS as string[])],
    );
    setUnsent(rows.filter((r) => UNSENT_STATUSES.includes(r.status)));
    setNoted(rows.filter((r) => !UNSENT_STATUSES.includes(r.status) && r.server_note));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    // Rows leave on their own as the server takes them.
    return onPendingChange(() => void load());
  }, [load]);

  const isTicked = useCallback(
    (row: OutboxRow) => isShareable(row) && !row.shared_at && !unticked.has(row.id),
    [unticked],
  );
  // A shared row stays unticked unless the person ticks it again.
  const [reticked, setReticked] = useState<Set<string>>(new Set());
  const ticked = useMemo(
    () => unsent.filter((r) => isTicked(r) || (isShareable(r) && reticked.has(r.id))),
    [isTicked, reticked, unsent],
  );

  const toggle = (row: OutboxRow) => {
    haptic.tap();
    const on = ticked.includes(row);
    const flip = (s: Set<string>, id: string, add: boolean) => {
      const next = new Set(s);
      if (add) next.add(id);
      else next.delete(id);
      return next;
    };
    if (row.shared_at) setReticked((s) => flip(s, row.id, !on));
    else setUnticked((s) => flip(s, row.id, on));
  };

  const share = async () => {
    if (ticked.length === 0) return;
    const result = await Share.share({ message: shareText(ticked, t) }).catch(() => null);
    if (result?.action === Share.sharedAction) {
      await markShared(ticked.map((r) => r.id));
      setReticked(new Set());
      haptic.success();
      await load();
    }
  };

  const tryAgain = async () => {
    setBusy(true);
    try {
      // A tap here is the person saying "try again", e.g. after a
      // supervisor gave them access. Background ticks never retry these.
      await requeueRejected();
      await flushOnce();
    } catch {
      // Still offline; the rows stay and say so.
    } finally {
      await load();
      setBusy(false);
    }
  };

  const notAllowed = unsent.filter((r) => r.status === 'rejected');
  const removeNotAllowed = () => {
    Alert.alert(t('clearQueueConfirm'), t('clearQueueBody', { count: notAllowed.length }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('clearBtn'),
        style: 'destructive',
        onPress: async () => {
          const db = await getDb();
          await db.runAsync(`DELETE FROM outbox WHERE status = 'rejected'`);
          await load();
        },
      },
    ]);
  };

  const renderUnsent = ({ item }: { item: OutboxRow }) => {
    const shareable = isShareable(item);
    const on = ticked.includes(item);
    const sub = [
      rowTime(item),
      !shareable ? t('photoSendsItself') : null,
      item.status === 'rejected' ? t('rejectedShort') : null,
    ].filter(Boolean).join('  ·  ');
    return (
      <ListRow
        leading={
          !shareable ? (
            <Circle size={26} color={palette.outlineVariant} />
          ) : on ? (
            <CheckCircle2 size={26} color={palette.primary} />
          ) : (
            <Circle size={26} color={palette.onSurfaceVariant} />
          )
        }
        title={describeRow(item, t)}
        subtitle={sub}
        trailing={item.shared_at ? <CheckCheck size={20} color={palette.success} accessibilityLabel={t('sentOnWhatsapp')} /> : undefined}
        onPress={shareable ? () => toggle(item) : undefined}
        showChevron={false}
      />
    );
  };

  return (
    <View style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar title={t('syncQueue')} onBack={() => navigation.goBack()} />

      {loading ? (
        <View style={styles.pad}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={56} style={{ marginBottom: spacing.md }} />
          ))}
        </View>
      ) : (
        <FlatList
          data={unsent}
          keyExtractor={(r) => r.id}
          renderItem={renderUnsent}
          ItemSeparatorComponent={RowDivider}
          refreshControl={<RefreshControl refreshing={busy} onRefresh={tryAgain} tintColor={palette.primary} />}
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          ListHeaderComponent={
            unsent.length > 0 ? (
              <Text variant="bodyLarge" color={palette.onSurfaceVariant} style={styles.pad}>
                {t('unsentHelp')}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <CircleCheckBig size={48} color={palette.success} />
              <Text variant="headlineSmall" style={{ textAlign: 'center', marginTop: spacing.md }}>
                {t('allSynced')}
              </Text>
            </View>
          }
          ListFooterComponent={
            noted.length > 0 ? (
              <View style={{ marginTop: spacing.lg }}>
                <SectionHeader title={t('savedWithNote')} />
                {noted.map((row) => (
                  <View key={row.id} style={styles.note}>
                    <Text variant="titleMedium" style={{ fontWeight: '600' }}>
                      {describeRow(row, t)}
                    </Text>
                    {/* The server's own sentence, in full: it is the news. */}
                    <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: 2 }}>
                      {row.server_note}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null
          }
        />
      )}

      {unsent.length > 0 ? (
        <View style={[styles.footer, { backgroundColor: palette.surface, borderTopColor: palette.outlineVariant }]}>
          <Button
            label={t('sendOnWhatsapp', { n: ticked.length })}
            Icon={MessageCircle}
            onPress={() => void share()}
            disabled={ticked.length === 0}
            size="lg"
            fullWidth
          />
          <View style={styles.secondary}>
            <Button label={t('tryAgain')} variant="text" size="md" onPress={() => void tryAgain()} loading={busy} />
            {notAllowed.length > 0 ? (
              <Button label={t('removeNotAllowed')} variant="text" size="md" onPress={removeNotAllowed} />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  pad: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  empty: { padding: spacing.xxl, alignItems: 'center' },
  footer: { padding: spacing.xl, borderTopWidth: 1 },
  note: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  secondary: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', marginTop: spacing.xs },
});
