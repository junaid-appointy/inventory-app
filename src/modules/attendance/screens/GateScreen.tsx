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
import {
  cosineSim,
  StubFaceEmbedder,
  type FaceEmbedder,
} from '../core/embedder';
import {
  gateReducer,
  INITIAL_GATE_STATE,
  RESULT_LINGER_MS,
} from '../core/machine';
import type { GalleryEntry, GateOutcome, PunchDirection } from '../core/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AttendanceGate'>;

// Phase 1: no backend / enrolled gallery yet, so every capture resolves
// locally against an empty gallery → "not recognized". This exercises the
// real flow (camera → capture → embed → match → result) honestly. Real
// matches appear once the engine attendance plugin + enrollment land.
const LOCAL_GALLERY: GalleryEntry[] = [];
const MATCH_THRESHOLD = 0.85;

// Single shared embedder for the screen's lifetime. Swap StubFaceEmbedder for
// the ONNX implementation in Phase 2 — nothing else here changes.
const embedder: FaceEmbedder = new StubFaceEmbedder();

function localMatch(
  embedding: number[],
): { entry: GalleryEntry; similarity: number } | null {
  let best: { entry: GalleryEntry; similarity: number } | null = null;
  for (const entry of LOCAL_GALLERY) {
    const similarity = cosineSim(embedding, entry.embedding);
    if (!best || similarity > best.similarity) best = { entry, similarity };
  }
  return best;
}

export function GateScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const t = useT();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const cameraRef = useRef<VisionCamera>(null);

  const [state, dispatch] = useReducer(gateReducer, INITIAL_GATE_STATE);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Boot: warm the embedder, then open the gate.
  useEffect(() => {
    let cancelled = false;
    void embedder.warmup().finally(() => {
      if (!cancelled) {
        dispatch({ type: 'boot_complete', gallerySize: LOCAL_GALLERY.length });
      }
    });
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

        dispatch({ type: 'frame_locked', mode: 'local' });
        const embedding = await embedder.embed({
          uri: photo.path,
          width: photo.width,
          height: photo.height,
        });
        if (cancelled) return;

        const match = localMatch(embedding);
        const recognized = match !== null && match.similarity >= MATCH_THRESHOLD;
        const outcome: GateOutcome = recognized ? 'checked_in' : 'no_match';
        const direction: PunchDirection | null = recognized ? 'in' : null;
        if (recognized) haptic.success();
        else haptic.warn();
        dispatch({
          type: 'result',
          outcome,
          staffName: recognized ? match!.entry.name : null,
          direction,
          offline: true,
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
      dispatch({ type: 'back_to_idle', gallerySize: LOCAL_GALLERY.length });
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
  staffName,
  offline,
  palette,
  t,
}: {
  outcome: GateOutcome;
  staffName: string | null;
  offline: boolean;
  palette: ReturnType<typeof useTheme>['palette'];
  t: ReturnType<typeof useT>;
}) {
  const recognized = outcome === 'checked_in' || outcome === 'checked_out';
  const Icon = recognized ? UserCheck : UserX;
  const tint = recognized ? palette.primary : palette.error;
  return (
    <View style={[styles.resultCard, { backgroundColor: palette.surface }]}>
      <Icon size={56} color={tint} strokeWidth={1.8} />
      <Text variant="titleLarge" style={{ color: palette.onSurface }}>
        {recognized
          ? outcome === 'checked_out' ? t('checkedOut') : t('checkedIn')
          : t('faceNotMatched')}
      </Text>
      {staffName ? (
        <Text variant="bodyLarge" style={{ color: palette.onSurfaceVariant }}>{staffName}</Text>
      ) : null}
      {recognized && offline ? (
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
