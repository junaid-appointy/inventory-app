import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { LucideIcon } from 'lucide-react-native';
import { CheckCircle2, Clock, CloudOff, Info, XCircle } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBar, Button, Card, spacing, Text } from '../../../design';
import { useT } from '../../../i18n';
import type { StringKey } from '../../../i18n/strings';
import type { RootStackParamList, VisitorQrMeta } from '../../../navigation/types';
import { useTheme } from '../../../theme';
import { haptic } from '../../../utils/haptics';
import { visitorApi, type VerifyResponse } from '../api';
import { findExpectedByToken } from '../cache';
import { timeOnly } from '../format';
import { queueVisitorEvent } from '../offline';

type Props = NativeStackScreenProps<RootStackParamList, 'PassResult'>;

type Outcome =
  | { kind: 'checking' }
  | { kind: 'checkingIn'; data: VerifyResponse }
  | { kind: 'checkedIn'; data: VerifyResponse }
  | { kind: 'alreadyInside'; data: VerifyResponse }
  | { kind: 'pending'; data: VerifyResponse }
  | { kind: 'invalid'; code: string; data?: VerifyResponse }
  | { kind: 'offline'; meta: VisitorQrMeta | null }
  | { kind: 'savedOffline'; meta: VisitorQrMeta | null }
  | { kind: 'error'; message: string };

const INVALID_LABEL: Record<string, StringKey> = {
  not_found: 'passNotFound',
  expired: 'passExpired',
  already_used: 'passAlreadyUsed',
  rejected: 'passRejected',
  cancelled: 'passCancelled',
  not_yet_valid: 'passNotYetValid',
};

/**
 * What happened to a scanned pass. An approved pass checks in on its own
 * (same as the web portal) so the guard's only job is to read the colour.
 * No internet: the guard can save the check-in and the server verifies it
 * when the phone is back online.
 */
export function PassResultScreen({ navigation, route }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const { token, meta } = route.params;
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'checking' });

  const run = useCallback(async () => {
    setOutcome({ kind: 'checking' });
    const res = await visitorApi.verify(token);
    if (res.offline) {
      // Fill in what we know from today's saved list, else from the QR.
      const guest = await findExpectedByToken(token);
      setOutcome({
        kind: 'offline',
        meta: guest
          ? { visitorName: guest.visitorName, hostName: guest.hostName ?? null, purpose: guest.purpose ?? null, phone: guest.visitorPhone ?? null }
          : meta ?? null,
      });
      return;
    }
    const data = res.data;
    if (!data) {
      setOutcome({ kind: 'error', message: t('somethingWrong') });
      return;
    }
    if (!data.invitation) {
      haptic.error();
      setOutcome({ kind: 'invalid', code: data.errorCode ?? 'not_found' });
      return;
    }
    if (data.session) {
      setOutcome({ kind: 'alreadyInside', data });
      return;
    }
    if (!data.valid) {
      haptic.error();
      setOutcome({ kind: 'invalid', code: data.errorCode ?? 'expired', data });
      return;
    }
    if (data.invitation.approval_status !== 'approved') {
      haptic.warn();
      setOutcome({ kind: 'pending', data });
      return;
    }
    setOutcome({ kind: 'checkingIn', data });
    const checkin = await visitorApi.checkIn(token);
    if (checkin.offline) {
      await queueVisitorEvent({
        eventType: 'qr_checkin_capture',
        qrToken: token,
        visitorName: data.invitation.visitor_name || undefined,
        hostName: data.invitation.host_employee_name || undefined,
        purpose: data.invitation.purpose || undefined,
      });
      setOutcome({ kind: 'savedOffline', meta: toMeta(data) });
      return;
    }
    if (checkin.ok && checkin.data?.success) {
      haptic.success();
      setOutcome({ kind: 'checkedIn', data });
      return;
    }
    haptic.error();
    setOutcome({ kind: 'error', message: checkin.data?.errorMessage ?? t('somethingWrong') });
  }, [meta, t, token]);

  useEffect(() => {
    void run();
  }, [run]);

  const saveOffline = useCallback(async (m: VisitorQrMeta | null) => {
    await queueVisitorEvent({
      eventType: 'qr_checkin_capture',
      qrToken: token,
      visitorName: m?.visitorName ?? undefined,
      hostName: m?.hostName ?? undefined,
      purpose: m?.purpose ?? undefined,
    });
    haptic.success();
    setOutcome({ kind: 'savedOffline', meta: m });
  }, [token]);

  const scanNext = () => navigation.replace('GateScan');

  let tone: 'success' | 'warn' | 'error' | 'neutral' = 'neutral';
  let Icon: LucideIcon = Info;
  let headline = '';
  let details: VisitorQrMeta | null = null;
  let validUntil: string | null = null;
  let note: string | null = null;

  switch (outcome.kind) {
    case 'checking':
    case 'checkingIn':
      break;
    case 'checkedIn':
      tone = 'success'; Icon = CheckCircle2; headline = t('checkedInDone');
      details = toMeta(outcome.data); validUntil = passEnd(outcome.data);
      break;
    case 'alreadyInside':
      tone = 'neutral'; Icon = Info; headline = t('alreadyInside');
      details = toMeta(outcome.data);
      break;
    case 'pending':
      tone = 'warn'; Icon = Clock; headline = t('passPending');
      details = toMeta(outcome.data); validUntil = passEnd(outcome.data);
      break;
    case 'invalid':
      tone = outcome.code === 'not_yet_valid' ? 'warn' : 'error';
      Icon = outcome.code === 'not_yet_valid' ? Clock : XCircle;
      headline = t(INVALID_LABEL[outcome.code] ?? 'passNotFound');
      details = outcome.data ? toMeta(outcome.data) : null;
      validUntil = outcome.data ? passEnd(outcome.data) : null;
      note = outcome.data?.errorMessage ?? null;
      break;
    case 'offline':
      tone = 'warn'; Icon = CloudOff; headline = t('offlineCapture');
      details = outcome.meta;
      break;
    case 'savedOffline':
      tone = 'success'; Icon = CheckCircle2; headline = t('savedForLater');
      details = outcome.meta;
      break;
    case 'error':
      tone = 'error'; Icon = XCircle; headline = outcome.message;
      break;
  }

  const busy = outcome.kind === 'checking' || outcome.kind === 'checkingIn';
  const bg = tone === 'success' ? palette.successContainer : tone === 'warn' ? palette.warnContainer
    : tone === 'error' ? palette.errorContainer : palette.surfaceContainerHigh;
  const fg = tone === 'success' ? palette.onSuccessContainer : tone === 'warn' ? palette.onWarnContainer
    : tone === 'error' ? palette.onErrorContainer : palette.onSurface;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppBar title={t('scanPass')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {busy ? (
          <View style={[styles.status, { backgroundColor: palette.surfaceContainerHigh }]}>
            <ActivityIndicator size="large" color={palette.primary} />
            <Text variant="titleLarge" style={styles.statusText}>
              {outcome.kind === 'checkingIn' ? t('checkingIn') : t('checkingPass')}
            </Text>
          </View>
        ) : (
          <View style={[styles.status, { backgroundColor: bg }]}>
            <Icon size={64} color={fg} strokeWidth={2} />
            <Text variant="headlineSmall" color={fg} style={styles.statusText}>
              {headline}
            </Text>
          </View>
        )}

        {details && (details.visitorName || details.hostName || details.purpose) ? (
          <Card tone="outlined" style={{ marginTop: spacing.lg }}>
            {details.visitorName ? <Detail label={t('visitorLabel')} value={details.visitorName} big /> : null}
            {details.hostName ? <Detail label={t('hostLabel')} value={details.hostName} /> : null}
            {details.purpose ? <Detail label={t('purposeLabel')} value={details.purpose} /> : null}
            {details.phone ? <Detail label={t('phoneLabel')} value={details.phone} /> : null}
            {validUntil ? <Detail label={t('validUntilLabel')} value={validUntil} /> : null}
          </Card>
        ) : null}

        {note ? (
          <Text variant="bodyMedium" color={palette.onSurfaceVariant} style={{ marginTop: spacing.md }}>
            {note}
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: palette.outlineVariant, backgroundColor: palette.surface }]}>
        {outcome.kind === 'offline' ? (
          <>
            <Button label={t('saveCheckIn')} onPress={() => void saveOffline(outcome.meta)} size="lg" fullWidth />
            <View style={{ height: spacing.sm }} />
            <Button label={t('retry')} onPress={() => void run()} variant="tonal" size="md" fullWidth />
          </>
        ) : outcome.kind === 'pending' || outcome.kind === 'error' ? (
          <>
            <Button label={t('retry')} onPress={() => void run()} size="lg" fullWidth />
            <View style={{ height: spacing.sm }} />
            <Button label={t('scanNext')} onPress={scanNext} variant="tonal" size="md" fullWidth />
          </>
        ) : (
          <Button label={t('scanNext')} onPress={scanNext} size="lg" fullWidth disabled={busy} />
        )}
      </View>
    </SafeAreaView>
  );
}

function toMeta(data: VerifyResponse): VisitorQrMeta {
  const inv = data.invitation;
  return {
    visitorName: inv?.visitor_name ?? data.session?.visitor_name ?? null,
    hostName: inv?.host_employee_name ?? data.session?.host_employee_name ?? null,
    purpose: inv?.purpose ?? data.session?.purpose ?? null,
    phone: inv?.visitor_phone ?? null,
  };
}

function passEnd(data: VerifyResponse): string | null {
  const end = data.invitation?.valid_until || data.invitation?.expires_at;
  if (!end) return null;
  const d = new Date(end);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()}/${d.getMonth() + 1} ${timeOnly(end)}`;
}

function Detail({ label, value, big }: { label: string; value: string; big?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={{ paddingVertical: spacing.xs }}>
      <Text variant="labelLarge" color={palette.onSurfaceVariant}>
        {label}
      </Text>
      <Text variant={big ? 'titleLarge' : 'bodyLarge'}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.xl },
  status: { borderRadius: 24, padding: spacing.xl, alignItems: 'center', gap: spacing.md },
  statusText: { textAlign: 'center' },
  footer: { padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
});
