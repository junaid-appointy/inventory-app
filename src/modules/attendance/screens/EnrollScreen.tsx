import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Camera, Check, ScanFace, UserCheck } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera as VisionCamera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';

import { AppBar, Button, ListItem, radius, Skeleton, spacing, Text } from '../../../design';
import { useT } from '../../../i18n';
import { RootStackParamList } from '../../../navigation/types';
import { useTheme } from '../../../theme';
import { haptic } from '../../../utils/haptics';
import { enrollFace, listStaff, type StaffDto } from '../api/client';
import { createEmbedder } from '../core/embedderFactory';

type Props = NativeStackScreenProps<RootStackParamList, 'AttendanceEnroll'>;

const embedder = createEmbedder();

type Phase =
  | { kind: 'list' }
  | { kind: 'capturing'; staff: StaffDto }
  | { kind: 'saving'; staff: StaffDto }
  | { kind: 'done'; staff: StaffDto };

export function EnrollScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const t = useT();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const cameraRef = useRef<VisionCamera>(null);

  const [staff, setStaff] = useState<StaffDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'list' });

  const loadStaff = useCallback(async () => {
    try {
      const res = await listStaff();
      setStaff(res.staff);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load staff');
      setStaff([]);
    }
  }, []);

  useEffect(() => {
    void embedder.warmup().catch(() => {});
    void loadStaff();
  }, [loadStaff]);

  const capture = useCallback(
    async (target: StaffDto) => {
      try {
        const cam = cameraRef.current;
        if (!cam) throw new Error('camera not ready');
        await new Promise((r) => setTimeout(r, 350));
        const photo = await cam.takePhoto({ flash: 'off' });
        const embedding = await embedder.embed({
          uri: photo.path,
          width: photo.width,
          height: photo.height,
        });
        setPhase({ kind: 'saving', staff: target });
        await enrollFace(target.id, embedding);
        haptic.success();
        setPhase({ kind: 'done', staff: target });
        void loadStaff();
        setTimeout(() => setPhase({ kind: 'list' }), 1600);
      } catch (e) {
        haptic.warn();
        setError(e instanceof Error ? e.message : t('enrollFailed'));
        setPhase({ kind: 'list' });
      }
    },
    [loadStaff, t],
  );

  // Kick off capture once the camera phase mounts and permission is granted.
  useEffect(() => {
    if (phase.kind !== 'capturing') return;
    void capture(phase.staff);
  }, [phase, capture]);

  const startEnroll = useCallback(
    (target: StaffDto) => {
      if (!hasPermission) {
        void requestPermission();
        return;
      }
      haptic.tap();
      setPhase({ kind: 'capturing', staff: target });
    },
    [hasPermission, requestPermission],
  );

  // ── Camera phases ──────────────────────────────────────────────
  if (phase.kind === 'capturing' || phase.kind === 'saving') {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: palette.background }]}>
        <AppBar title={phase.staff.name} onBack={() => setPhase({ kind: 'list' })} />
        <View style={styles.stage}>
          {device && phase.kind === 'capturing' ? (
            <VisionCamera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive
              photo
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: palette.surfaceContainer }]}>
              <ScanFace size={96} color={palette.primary} strokeWidth={1.4} />
            </View>
          )}
          <View style={styles.overlay} pointerEvents="none">
            <View style={styles.pill}>
              <ActivityIndicator color={palette.onPrimary} />
              <Text variant="bodyLarge" style={{ color: palette.onPrimary }}>
                {phase.kind === 'saving' ? t('enrolling') : t('enrollLookHint')}
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (phase.kind === 'done') {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: palette.background }]}>
        <AppBar title={t('enrollFaces')} onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <UserCheck size={64} color={palette.primary} strokeWidth={1.6} />
          <Text variant="titleLarge" style={{ color: palette.onSurface }}>{t('enrollSaved')}</Text>
          <Text variant="bodyLarge" style={{ color: palette.onSurfaceVariant }}>{phase.staff.name}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── List phase ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: palette.background }]}>
      <AppBar title={t('enrollFaces')} subtitle={t('enrollSelectHint')} onBack={() => navigation.goBack()} />
      {!hasPermission ? (
        <View style={styles.permissionBar}>
          <Camera size={20} color={palette.onSurfaceVariant} strokeWidth={2} />
          <Button label={t('grantCamera')} onPress={requestPermission} />
        </View>
      ) : null}
      {error ? (
        <Text variant="bodyMedium" style={{ color: palette.error, padding: spacing.md }}>{error}</Text>
      ) : null}
      {staff === null ? (
        <View style={{ padding: spacing.md, gap: spacing.sm }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={56} />
          ))}
        </View>
      ) : staff.length === 0 ? (
        <View style={styles.center}>
          <Text variant="bodyLarge" style={{ color: palette.onSurfaceVariant }}>{t('noStaffFound')}</Text>
        </View>
      ) : (
        <FlatList
          data={staff}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: spacing.sm }}
          renderItem={({ item }) => (
            <ListItem
              title={item.name}
              subtitle={item.employee_code ?? undefined}
              onPress={() => startEnroll(item)}
              trailing={
                item.enrolled ? (
                  <View style={styles.enrolledTag}>
                    <Check size={16} color={palette.primary} strokeWidth={2.4} />
                    <Text variant="labelMedium" style={{ color: palette.primary }}>{t('enrolledLabel')}</Text>
                  </View>
                ) : (
                  <Text variant="labelMedium" style={{ color: palette.onSurfaceVariant }}>{t('notEnrolled')}</Text>
                )
              }
            />
          )}
        />
      )}
    </SafeAreaView>
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
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  permissionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
  },
  enrolledTag: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
