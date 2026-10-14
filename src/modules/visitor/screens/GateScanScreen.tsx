import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { X, Zap, ZapOff } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, Code, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';
import { Button, IconButton, radius, spacing, Text } from '../../../design';
import { useT } from '../../../i18n';
import type { RootStackParamList } from '../../../navigation/types';
import { useTheme } from '../../../theme';
import { haptic } from '../../../utils/haptics';
import { extractPassToken } from '../qr';

type Props = NativeStackScreenProps<RootStackParamList, 'GateScan'>;

/**
 * Visitor pass scanner. QR only: product barcodes belong to inventory's
 * scanner, and a pass is always a QR. One read is enough (ML Kit is
 * confident); the result screen replaces this one.
 */
export function GateScanScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  // Only run the camera while this screen has focus (native-stack keeps it
  // mounted underneath the result screen otherwise).
  const isFocused = useIsFocused();
  const [torch, setTorch] = useState(false);
  const acceptedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      acceptedRef.current = false;
    }, []),
  );

  const onCodeScanned = useCallback(
    (codes: Code[]) => {
      if (acceptedRef.current) return;
      const raw = codes.find((c) => c.value)?.value;
      if (!raw) return;
      const { token, meta } = extractPassToken(raw);
      if (!token) {
        haptic.warn();
        return;
      }
      acceptedRef.current = true;
      haptic.success();
      navigation.replace('PassResult', { token, meta });
    },
    [navigation],
  );

  const codeScanner = useCodeScanner({ codeTypes: ['qr'], onCodeScanned });

  if (!hasPermission) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: palette.background }]}>
        <Text variant="headlineSmall" style={{ textAlign: 'center', marginBottom: spacing.md }}>
          {t('cameraNeeded')}
        </Text>
        <Text variant="bodyLarge" color={palette.onSurfaceVariant} style={{ textAlign: 'center', marginBottom: spacing.xl }}>
          {t('cameraHint')}
        </Text>
        <Button label={t('allowCamera')} onPress={requestPermission} size="lg" fullWidth />
        <Button label={t('notNow')} variant="text" onPress={() => navigation.goBack()} style={{ marginTop: spacing.sm }} />
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: palette.background }]}>
        <Text variant="headlineSmall" style={{ textAlign: 'center' }}>
          {t('noCamera')}
        </Text>
        <Button label={t('back')} variant="text" onPress={() => navigation.goBack()} style={{ marginTop: spacing.md }} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isFocused}
        torch={torch ? 'on' : 'off'}
        codeScanner={codeScanner}
        resizeMode="cover"
      />
      <View pointerEvents="none" style={styles.frameWrap}>
        <View style={[styles.frame, { borderColor: palette.primaryContainer }]} />
      </View>
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <View style={styles.topRow}>
          <IconButton Icon={X} onPress={() => navigation.goBack()} tone="inverse" />
          <Text variant="titleMedium" color="#fff">
            {t('scanPass')}
          </Text>
          <IconButton Icon={torch ? Zap : ZapOff} onPress={() => setTorch((v) => !v)} tone="inverse" />
        </View>
      </SafeAreaView>
      <SafeAreaView edges={['bottom']} style={styles.bottom}>
        <Text variant="bodyLarge" color="#fff" style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}>
          {t('scanPassSub')}
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  frameWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 260, height: 260, borderWidth: 4, borderRadius: radius.xl },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  bottom: { position: 'absolute', bottom: spacing.xxl, left: 0, right: 0 },
});
