import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Keyboard, X, Zap, ZapOff } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  Code,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import { Button, IconButton, palette, radius, spacing, Text } from '../../../design';
import { findProduct, upsertProduct } from '../../../db/products';
import { RootStackParamList } from '../../../navigation/types';
import { api } from '../../../sync/api';
import { haptic } from '../../../utils/haptics';

type Props = NativeStackScreenProps<RootStackParamList, 'Scanner'>;

// Vision-camera / ML Kit format names. Order doesn't affect decoding —
// every frame is tried against every requested format. Listed broadly so
// dense GS1-128 SSCC labels, EAN/UPC products, QR, DataMatrix all work.
const CODE_TYPES = [
  'code-128',
  'code-39',
  'code-93',
  'codabar',
  'ean-13',
  'ean-8',
  'itf',
  'upc-a',
  'upc-e',
  'qr',
  'data-matrix',
  'pdf-417',
  'aztec',
] as const;

// Wait this long (ms) for a second identical read before accepting a code.
// Filters single-frame misreads without making good reads feel sluggish.
// If a wrong code still slips through, the user can tap "Scan again" on
// the next screen — no need for a time-limited retry banner here.
const CONFIRM_WINDOW_MS = 600;

export function ScannerScreen({ navigation }: Props) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [torch, setTorch] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState('');

  // Refs that survive renders but don't drive UI:
  //   acceptedRef — true while a code is being routed; blocks further reads.
  //   firstReadRef — last "saw it once" candidate; second matching read commits.
  const acceptedRef = useRef(false);
  const firstReadRef = useRef<{ value: string; at: number } | null>(null);

  const flashOpacity = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // Pulse the reticle border to communicate omnidirectional detection.
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const flash = useCallback(() => {
    flashOpacity.setValue(0.6);
    Animated.timing(flashOpacity, {
      toValue: 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [flashOpacity]);

  /**
   * Route a barcode to the next screen. Local catalog → Receiving;
   * otherwise ask the backend; final fallback is the registration flow.
   */
  const routeFor = useCallback(
    async (raw: string) => {
      const local = await findProduct(raw).catch(() => null);
      if (local) {
        navigation.replace('Receiving', { barcode: raw });
        return;
      }
      try {
        const hit = await api.fetch.catalog(raw);
        if (hit.product) {
          await upsertProduct({
            barcode: hit.product.barcode,
            name: hit.product.name,
            category: hit.product.category,
            unit: hit.product.unit,
          });
          navigation.replace('Receiving', { barcode: raw });
          return;
        }
      } catch {
        // Offline / 401 — fall through to local registration flow.
      }
      navigation.replace('RegisterProduct', { barcode: raw });
    },
    [navigation],
  );

  /** Entry point for both camera scans (after the 2-read gate) and manual entry. */
  const acceptCode = useCallback(
    (raw: string) => {
      if (acceptedRef.current) return;
      acceptedRef.current = true;
      haptic.success();
      flash();
      routeFor(raw);
    },
    [flash, routeFor],
  );

  const onCodeScanned = useCallback(
    (codes: Code[]) => {
      if (acceptedRef.current) return;
      const first = codes.find((c) => c.value);
      if (!first?.value) return;
      const raw = first.value;

      // Require two consecutive identical reads within the confirm window.
      // ML Kit fires onCodeScanned repeatedly while a code is visible, so
      // this typically costs ~one extra frame (~50ms) on real codes and
      // rejects single-frame misreads outright.
      const last = firstReadRef.current;
      const now = Date.now();
      if (!last || last.value !== raw || now - last.at > CONFIRM_WINDOW_MS) {
        firstReadRef.current = { value: raw, at: now };
        return;
      }
      firstReadRef.current = null;
      acceptCode(raw);
    },
    [acceptCode],
  );

  const codeScanner = useCodeScanner({
    codeTypes: [...CODE_TYPES],
    onCodeScanned,
  });

  const submitManual = useCallback(() => {
    const v = manualValue.trim();
    if (!v) return;
    setManualOpen(false);
    setManualValue('');
    if (acceptedRef.current) return;
    acceptedRef.current = true;
    haptic.success();
    routeFor(v);
  }, [manualValue, routeFor]);

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.permission}>
        <Text variant="headlineSmall" style={{ textAlign: 'center', marginBottom: spacing.md }}>
          Camera access needed
        </Text>
        <Text
          variant="bodyLarge"
          color={palette.onSurfaceVariant}
          style={{ textAlign: 'center', marginBottom: spacing.xl }}
        >
          We use the camera only to read barcodes — no photos are taken.
        </Text>
        <Button label="Allow camera" onPress={requestPermission} size="lg" fullWidth />
        <Button
          label="Not now"
          variant="text"
          onPress={() => navigation.goBack()}
          style={{ marginTop: spacing.sm }}
        />
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.permission}>
        <Text variant="headlineSmall" style={{ textAlign: 'center' }}>
          No camera available
        </Text>
        <Button
          label="Back"
          variant="text"
          onPress={() => navigation.goBack()}
          style={{ marginTop: spacing.md }}
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        torch={torch ? 'on' : 'off'}
        codeScanner={codeScanner}
      />

      {/* Dimmed border around the reticle. Pure cosmetics — detection
          is full-frame, so this is just a "look here" hint. */}
      <View pointerEvents="none" style={styles.maskTop} />
      <View pointerEvents="none" style={styles.maskRow}>
        <View style={styles.maskSide} />
        <View style={styles.window}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.reticle,
              {
                opacity: pulseOpacity,
                transform: [{ scale: pulseScale }],
                borderColor: palette.primaryContainer,
              },
            ]}
          />
        </View>
        <View style={styles.maskSide} />
      </View>
      <View pointerEvents="none" style={styles.maskBottom} />

      <Animated.View pointerEvents="none" style={[styles.flash, { opacity: flashOpacity }]} />

      <SafeAreaView edges={['top']} style={styles.topBar}>
        <View style={styles.topBarRow}>
          <IconButton Icon={X} onPress={() => navigation.goBack()} tone="inverse" />
          <Text variant="titleMedium" color="#fff">
            Scan barcode
          </Text>
          <IconButton
            Icon={torch ? Zap : ZapOff}
            onPress={() => setTorch((t) => !t)}
            tone="inverse"
          />
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.bottom}>
        <Text
          variant="bodyLarge"
          color="#fff"
          style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}
        >
          Point at any barcode — any angle works.
        </Text>
        <Pressable
          onPress={() => setManualOpen(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.typeBtn,
            { backgroundColor: pressed ? '#ffffff22' : '#ffffff11' },
          ]}
        >
          <Keyboard size={18} color="#fff" strokeWidth={2.2} />
          <Text variant="labelLarge" color="#fff">
            Type code
          </Text>
        </Pressable>
      </SafeAreaView>

      {manualOpen && (
        <Pressable style={styles.modalBackdrop} onPress={() => setManualOpen(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalCenter}
            pointerEvents="box-none"
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={[styles.modalCard, { backgroundColor: palette.surface }]}
            >
              <Text variant="titleLarge">Type the barcode</Text>
              <Text
                variant="bodyMedium"
                color={palette.onSurfaceVariant}
                style={{ marginTop: spacing.xs }}
              >
                Use this when the label is damaged or won't scan.
              </Text>
              <TextInput
                value={manualValue}
                onChangeText={setManualValue}
                placeholder="e.g. 8901030875021"
                placeholderTextColor={palette.onSurfaceVariant}
                keyboardType="number-pad"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={submitManual}
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: palette.surfaceContainerLowest,
                    borderColor: palette.outlineVariant,
                    color: palette.onSurface,
                  },
                ]}
              />
              <View style={styles.modalActions}>
                <Button
                  label="Cancel"
                  variant="text"
                  size="md"
                  onPress={() => setManualOpen(false)}
                />
                <Button
                  label="Use code"
                  size="md"
                  disabled={manualValue.trim().length === 0}
                  onPress={submitManual}
                />
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      )}
    </View>
  );
}

// Reticle covers most of the screen width so the user has plenty of room
// to frame a barcode at any rotation. Detection is full-frame regardless —
// the reticle is purely a "look here" hint.
const WINDOW = Math.min(Dimensions.get('window').width - 32, 340);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  permission: {
    flex: 1,
    backgroundColor: palette.background,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  maskTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  maskBottom: { flex: 1.4, backgroundColor: 'rgba(0,0,0,0.45)' },
  maskRow: { flexDirection: 'row', height: WINDOW },
  maskSide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  window: { width: WINDOW, height: WINDOW, overflow: 'visible' },
  reticle: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 3,
    borderRadius: 18,
  },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff' },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  typeBtn: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#ffffff66',
    overflow: 'hidden',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  modalInput: {
    marginTop: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    minHeight: 56,
    fontSize: 18,
    letterSpacing: 1,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
