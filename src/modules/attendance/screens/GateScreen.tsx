import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Camera, ScanFace, UserCheck, UserX, RefreshCw } from 'lucide-react-native';
import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera as VisionCamera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';

import { AppBar, Button, radius, spacing, Text } from '../../../design';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { useTheme } from '../../../theme';
import { haptic } from '../../../utils/haptics';
import { type FaceEmbedder } from '../core/embedder';
import { createEmbedder } from '../core/embedderFactory';
import { getPunchGeo } from '../core/geo';
import {
  gateReducer,
  INITIAL_GATE_STATE,
  RESULT_LINGER_MS,
} from '../core/machine';
import { bootAttendance, submitPunch } from '../core/runtime';
import type { GateOutcome } from '../core/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AttendanceGate'>;

// Single embedder for the screen's lifetime. The factory returns the real
// ONNX embedder once a model asset is bundled, else the stub — nothing here
// changes either way.
const embedder: FaceEmbedder = createEmbedder();

export function GateScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const t = useT();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const cameraRef = useRef<VisionCamera>(null);

  const [state, dispatch] = useReducer(gateReducer, INITIAL_GATE_STATE);
  const stateRef = useRef(state);
  const gallerySizeRef = useRef(0);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Boot: warm the embedder + sync gallery/config/outbox, then open the gate.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ gallerySize }] = await Promise.all([
        bootAttendance(),
        embedder.warmup().catch(() => {}),
      ]);
      if (cancelled) return;
      gallerySizeRef.current = gallerySize;
      dispatch({ type: 'boot_complete', gallerySize });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Capture → embed → match, driven by the machine.
  useEffect(() => {
    if (state.kind !== 'capturing') return;
    let cancelled = false;

    (async () => {
      try {
        const cam = cameraRef.current;
        if (!cam) throw new Error('camera not ready');
        // Small settle so the preview has a framed face before the shot.
        await new Promise((r) => setTimeout(r, 350));
        const photo = await cam.takePhoto({ flash: 'off' });
        if (cancelled) return;

        const embedding = await embedder.embed({
          uri: photo.path,
          width: photo.width,
          height: photo.height,
        });
        if (cancelled) return;

        // Capture location in parallel (soft signal), then route to server or
        // offline outbox via the runtime.
        dispatch({ type: 'frame_locked', mode: 'server' });
        const geo = await getPunchGeo();
        if (cancelled) return;
        const result = await submitPunch(embedding, geo);
        if (cancelled) return;

        const recognized =
          result.outcome === 'checked_in' ||
          result.outcome === 'checked_out' ||
          result.outcome === 'duplicate' ||
          result.outcome === 'offline_pending';
        if (recognized) haptic.success();
        else haptic.warn();
        dispatch({
          type: 'result',
          outcome: result.outcome,
          staffName: result.staffName,
          direction: result.direction,
          offline: result.offline,
        });
      } catch (err) {
        if (!cancelled) {
          dispatch({
            type: 'error',
            message: err instanceof Error ? err.message : 'Capture failed',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.kind]);

  // Auto-return to idle after a result or error.
  useEffect(() => {
    if (state.kind !== 'result' && state.kind !== 'error') return;
    const timer = setTimeout(() => {
      dispatch({ type: 'back_to_idle', gallerySize: gallerySizeRef.current });
    }, RESULT_LINGER_MS);
    return () => clearTimeout(timer);
  }, [state.kind]);

  const onTap = useCallback(() => {
    if (stateRef.current.kind !== 'idle') return;
    haptic.tap();
    dispatch({ type: 'tap' });
  }, []);

  const cameraActive = state.kind === 'capturing' || state.kind === 'matching';

  // ── Permission / device gates ──────────────────────────────────
  if (!hasPermission) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: palette.background }]}>
        <AppBar title={t('attendance')} onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Camera size={48} color={palette.onSurfaceVariant} strokeWidth={1.8} />
          <Text variant="bodyLarge" style={{ color: palette.onSurfaceVariant, textAlign: 'center' }}>
            {t('cameraNeeded')}
          </Text>
          <Button label={t('grantCamera')} onPress={requestPermission} />
        </View>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: palette.background }]}>
        <AppBar title={t('attendance')} onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Text variant="bodyLarge" style={{ color: palette.onSurfaceVariant }}>{t('noCamera')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: palette.background }]}>
      <AppBar title={t('attendance')} onBack={() => navigation.goBack()} />

      <View style={styles.stage}>
        {cameraActive ? (
          <VisionCamera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={cameraActive}
            photo
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: palette.surfaceContainer }]}>
            <ScanFace size={96} color={palette.primary} strokeWidth={1.4} />
          </View>
        )}

        {/* Overlay: state-driven copy + progress */}
        <View style={styles.overlay} pointerEvents="none">
          {state.kind === 'matching' && (
            <View style={styles.pill}>
              <ActivityIndicator color={palette.onPrimary} />
              <Text variant="bodyLarge" style={{ color: palette.onPrimary }}>{t('checkingFace')}</Text>
            </View>
          )}
          {state.kind === 'capturing' && (
            <Text variant="titleLarge" style={styles.centerCopy}>{t('lookAtCamera')}</Text>
          )}
        </View>

        {state.kind === 'result' && (
          <ResultCard
            outcome={state.outcome}
            direction={state.direction}
            staffName={state.staffName}
            offline={state.offline}
            palette={palette}
            t={t}
          />
        )}

        {state.kind === 'error' && (
          <View style={[styles.resultCard, { backgroundColor: palette.surface }]}>
            <UserX size={56} color={palette.error} strokeWidth={1.8} />
            <Text variant="titleLarge" style={{ color: palette.onSurface }}>{t('faceTryAgain')}</Text>
            <Text variant="bodyMedium" style={{ color: palette.onSurfaceVariant, textAlign: 'center' }}>
              {state.message}
            </Text>
          </View>
        )}
      </View>

      {/* Primary action — one obvious tap. */}
      <View style={styles.actionBar}>
        {state.kind === 'idle' ? (
          <Pressable
            onPress={onTap}
            style={({ pressed }) => [
              styles.tapBtn,
              { backgroundColor: palette.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <ScanFace size={28} color={palette.onPrimary} strokeWidth={2} />
            <Text variant="titleLarge" style={{ color: palette.onPrimary }}>{t('tapToCheckIn')}</Text>
          </Pressable>
        ) : state.kind === 'result' || state.kind === 'error' ? (
          <View style={styles.againRow}>
            <RefreshCw size={18} color={palette.onSurfaceVariant} strokeWidth={2} />
            <Text variant="bodyMedium" style={{ color: palette.onSurfaceVariant }}>{t('lookAtCamera')}</Text>
          </View>
        ) : (
          <View style={styles.againRow}>
            <ActivityIndicator color={palette.primary} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function ResultCard({
  outcome,
  direction,
  staffName,
  offline,
  palette,
  t,
}: {
  outcome: GateOutcome;
  direction: 'in' | 'out' | null;
  staffName: string | null;
  offline: boolean;
  palette: ReturnType<typeof useTheme>['palette'];
  t: ReturnType<typeof useT>;
}) {
  const pending = outcome === 'offline_pending';
  const recognized =
    outcome === 'checked_in' ||
    outcome === 'checked_out' ||
    outcome === 'duplicate' ||
    pending;
  const Icon = recognized ? UserCheck : UserX;
  const tint = recognized ? palette.primary : palette.error;
  const label =
    outcome === 'checked_out'
      ? t('checkedOut')
      : outcome === 'duplicate'
        ? direction === 'out' ? t('checkedOut') : t('checkedIn')
        : outcome === 'checked_in' || pending
          ? t('checkedIn')
          : t('faceNotMatched');
  return (
    <View style={[styles.resultCard, { backgroundColor: palette.surface }]}>
      <Icon size={56} color={tint} strokeWidth={1.8} />
      <Text variant="titleLarge" style={{ color: palette.onSurface }}>
        {label}
      </Text>
      {staffName ? (
        <Text variant="bodyLarge" style={{ color: palette.onSurfaceVariant }}>{staffName}</Text>
      ) : null}
      {pending || (recognized && offline) ? (
        <Text variant="bodyMedium" style={{ color: palette.onSurfaceVariant, textAlign: 'center' }}>
          {t('savedOffline')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  stage: {
    flex: 1,
    margin: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: spacing.xl,
  },
  centerCopy: {
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  resultCard: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  actionBar: {
    padding: spacing.md,
    minHeight: 88,
    justifyContent: 'center',
  },
  tapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
  },
  againRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
