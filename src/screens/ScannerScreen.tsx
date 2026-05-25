import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
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
import { Button, IconButton, palette, spacing, Text } from '../design';
import { findProduct } from '../db/products';
import { RootStackParamList } from '../navigation/types';
import { haptic } from '../utils/haptics';

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

export function ScannerScreen({ navigation }: Props) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [torch, setTorch] = useState(false);
  const lockedRef = useRef(false);
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const linePos = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(linePos, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(linePos, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [linePos]);

  const flash = useCallback(() => {
    flashOpacity.setValue(0.6);
    Animated.timing(flashOpacity, {
      toValue: 0,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [flashOpacity]);

  const onCodeScanned = useCallback(
    (codes: Code[]) => {
      if (lockedRef.current) return;
      const first = codes.find((c) => c.value);
      if (!first?.value) return;

      // Strip GS1 FNC1 (ASCII 29 / "GS") so the printable payload is usable.
      // For SSCC labels the raw value contains FNC1 between AIs.
      const raw = first.value;
      const printable = raw.replace(/\x1d/g, '|');
      console.log('[scan]', first.type, JSON.stringify(printable));

      lockedRef.current = true;
      haptic.success();
      flash();
      findProduct(raw)
        .then((existing) => {
          if (existing) navigation.replace('Receiving', { barcode: raw });
          else navigation.replace('RegisterProduct', { barcode: raw });
        })
        .catch(() => navigation.replace('RegisterProduct', { barcode: raw }));
    },
    [navigation, flash]
  );

  const codeScanner = useCodeScanner({
    codeTypes: [...CODE_TYPES],
    onCodeScanned,
  });

  const lineY = linePos.interpolate({ inputRange: [0, 1], outputRange: [0, 220] });

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

      <View style={styles.maskTop} />
      <View style={styles.maskRow}>
        <View style={styles.maskSide} />
        <View style={styles.window}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
          <Animated.View style={[styles.scanLine, { transform: [{ translateY: lineY }] }]} />
        </View>
        <View style={styles.maskSide} />
      </View>
      <View style={styles.maskBottom} />

      <Animated.View pointerEvents="none" style={[styles.flash, { opacity: flashOpacity }]} />

      <SafeAreaView edges={['top']} style={styles.topBar}>
        <View style={styles.topBarRow}>
          <IconButton icon="✕" onPress={() => navigation.goBack()} tone="inverse" />
          <Text variant="titleMedium" color="#fff">
            Scan barcode
          </Text>
          <IconButton
            icon={torch ? '◉' : '○'}
            onPress={() => setTorch((t) => !t)}
            tone="inverse"
          />
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.hint}>
        <Text
          variant="bodyLarge"
          color="#fff"
          style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}
        >
          Hold steady. Align the barcode inside the frame.
        </Text>
      </SafeAreaView>
    </View>
  );
}

const WINDOW = 260;

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
  maskTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  maskBottom: { flex: 1.4, backgroundColor: 'rgba(0,0,0,0.55)' },
  maskRow: { flexDirection: 'row', height: WINDOW },
  maskSide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  window: { width: WINDOW, height: WINDOW, overflow: 'hidden' },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: '#fff' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },
  scanLine: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 2,
    backgroundColor: palette.primaryContainer,
    shadowColor: palette.primaryContainer,
    shadowOpacity: 1,
    shadowRadius: 8,
    ...(Platform.OS === 'android' ? { elevation: 4 } : null),
  },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff' },
  hint: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: spacing.lg },
});
