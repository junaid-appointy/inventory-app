import { Camera as CameraIcon, Check, RotateCcw, X } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraFormat, useCameraPermission } from 'react-native-vision-camera';
import { Appear, Button, PressScale, spacing, Text } from '../../../design';
import { useT } from '../../../i18n';
import { useTheme } from '../../../theme';
import { haptic } from '../../../utils/haptics';
import { compressLikeWhatsApp, discardPhoto, keepPhoto } from '../itemPhoto';

/**
 * An item's proof photo (all its packs together): a big "take a photo"
 * tile, then the photo itself with "Take again". Required before the item
 * is added, so it sits right above that button.
 */
export function ItemPhoto({
  uri,
  onChange,
  amount,
  cameraOpen,
  onCameraOpenChange,
}: {
  uri: string | null;
  onChange: (uri: string | null) => void;
  /** What is in the photo, spoken: "50 packets", "4 kg 800 g". */
  /** What is in the photo; null when it is a single pack. */
  amount: string | null;
  /** Optional: let the screen open the camera too (e.g. from its main button). */
  cameraOpen?: boolean;
  onCameraOpenChange?: (open: boolean) => void;
}) {
  const t = useT();
  const { palette } = useTheme();
  const [openState, setOpenState] = useState(false);
  const open = cameraOpen ?? openState;
  const setOpen = (next: boolean) => (onCameraOpenChange ? onCameraOpenChange(next) : setOpenState(next));

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.titleRow}>
        <View style={[styles.titleIcon, { backgroundColor: palette.primaryContainer }]}>
          <CameraIcon size={22} color={palette.onPrimaryContainer} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="titleMedium" style={{ fontWeight: '700' }}>
            {t('itemPhotoTitle')}
          </Text>
          <Text variant="bodyMedium" color={palette.onSurfaceVariant}>
            {amount ? t('itemPhotoHint', { amount }) : t('itemPhotoHintOne')}
          </Text>
        </View>
      </View>

      {uri ? (
        // Keyed by the photo, so a retake eases in too.
        <Appear key={uri}>
        <View style={[styles.preview, { borderColor: palette.outlineVariant }]}>
          <Image source={{ uri }} style={styles.previewImage} resizeMode="cover" accessibilityLabel={t('itemPhotoTitle')} />
          <View style={[styles.done, { backgroundColor: palette.success }]}>
            <Check size={16} color={palette.onSuccess} strokeWidth={3} />
          </View>
          <Pressable
            onPress={() => {
              haptic.tap();
              setOpen(true);
            }}
            accessibilityRole="button"
            style={[styles.retake, { backgroundColor: palette.surfaceContainerLowest }]}
          >
            <RotateCcw size={18} color={palette.onSurface} />
            <Text variant="labelLarge" style={{ fontWeight: '700' }}>
              {t('retakePhoto')}
            </Text>
          </Pressable>
        </View>
        </Appear>
      ) : (
        <PressScale
          to={0.98}
          onPress={() => {
            haptic.tap();
            setOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('takeItemPhoto')}
          style={[styles.empty, { borderColor: palette.primary, backgroundColor: palette.primaryContainer }]}
        >
          <CameraIcon size={40} color={palette.onPrimaryContainer} strokeWidth={1.8} />
          <Text variant="titleMedium" color={palette.onPrimaryContainer} style={{ fontWeight: '700', alignSelf: 'stretch', textAlign: 'center' }}>
            {t('takeItemPhoto')}
          </Text>
        </PressScale>
      )}

      <CameraSheet
        visible={open}
        onClose={() => setOpen(false)}
        onPhoto={(next) => {
          discardPhoto(uri);
          onChange(next);
          setOpen(false);
        }}
      />
    </View>
  );
}

/** Full-screen camera: shoot, look, keep or take again. */
export function CameraSheet({ visible, onClose, onPhoto }: { visible: boolean; onClose: () => void; onPhoto: (uri: string) => void }) {
  const t = useT();
  const { palette } = useTheme();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  // About 1.2 megapixels: clear enough to read a label, small enough
  // (a few hundred KB) for a weak connection.
  const format = useCameraFormat(device, [{ photoResolution: { width: 1600, height: 1200 } }]);
  const camera = useRef<Camera>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    discardPhoto(shot);
    setShot(null);
    setError(null);
    onClose();
  };

  const capture = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await camera.current.takePhoto({ enableShutterSound: false });
      haptic.success();
      // Shrink it like WhatsApp before keeping it: a quarter of the data on weak Wi-Fi.
      const cameraUri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
      const small = await compressLikeWhatsApp(cameraUri);
      if (small !== cameraUri) discardPhoto(cameraUri);
      setShot(keepPhoto(small));
    } catch {
      setError(t('photoFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={styles.cameraRoot}>
        {!hasPermission ? (
          <SafeAreaView style={[styles.permission, { backgroundColor: palette.background }]}>
            <Text variant="headlineSmall" style={{ textAlign: 'center' }}>
              {t('cameraNeeded')}
            </Text>
            <Button label={t('allowCamera')} onPress={requestPermission} size="lg" fullWidth />
            <Button label={t('notNow')} variant="text" onPress={close} />
          </SafeAreaView>
        ) : !device ? (
          <SafeAreaView style={[styles.permission, { backgroundColor: palette.background }]}>
            <Text variant="headlineSmall" style={{ textAlign: 'center' }}>
              {t('noCamera')}
            </Text>
            <Button label={t('back')} variant="text" onPress={close} />
          </SafeAreaView>
        ) : shot ? (
          <>
            <Image source={{ uri: shot }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
              <Button
                label={t('retakePhoto')}
                variant="tonal"
                size="lg"
                Icon={RotateCcw}
                onPress={() => {
                  discardPhoto(shot);
                  setShot(null);
                }}
                style={{ flex: 1 }}
              />
              <Button label={t('usePhoto')} size="lg" Icon={Check} onPress={() => { const s = shot; setShot(null); onPhoto(s); }} style={{ flex: 1 }} />
            </SafeAreaView>
          </>
        ) : (
          <>
            <Camera
              ref={camera}
              style={StyleSheet.absoluteFill}
              device={device}
              format={format}
              isActive={visible && !shot}
              photo
              photoQualityBalance="speed"
              resizeMode="cover"
            />
            <SafeAreaView edges={['top']} style={styles.topBar}>
              <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t('cancel')} hitSlop={12} style={styles.roundBtn}>
                <X size={26} color="#FFFFFF" />
              </Pressable>
            </SafeAreaView>
            <SafeAreaView edges={['bottom']} style={styles.shutterBar}>
              {error ? (
                <Text variant="bodyLarge" color="#FFFFFF" style={{ textAlign: 'center', marginBottom: spacing.md }}>
                  {error}
                </Text>
              ) : (
                <Text variant="bodyLarge" color="#FFFFFF" style={{ alignSelf: 'stretch', textAlign: 'center', marginBottom: spacing.md }}>
                  {t('photoFrameHint')}
                </Text>
              )}
              <Pressable
                onPress={capture}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t('takeItemPhoto')}
                style={styles.shutterOuter}
              >
                <View style={styles.shutterInner}>{busy ? <ActivityIndicator color={palette.primary} /> : null}</View>
              </Pressable>
            </SafeAreaView>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  titleIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  empty: { height: 140, borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  preview: { height: 200, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  previewImage: { width: '100%', height: '100%' },
  done: { position: 'absolute', top: spacing.sm, left: spacing.sm, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  retake: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: 20,
  },
  cameraRoot: { flex: 1, backgroundColor: '#000000' },
  permission: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  roundBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  shutterBar: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingBottom: spacing.xl, paddingHorizontal: spacing.xl },
  shutterOuter: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: spacing.md, padding: spacing.lg, backgroundColor: 'rgba(0,0,0,0.55)' },
});
