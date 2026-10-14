import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { X, Zap, ZapOff } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, Code, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';
import { useCan } from '../auth';
import { Button, IconButton, radius, spacing, Text } from '../design';
import { useT } from '../i18n';
import { PRODUCT_CODE_TYPES, resolveBarcodeRoute } from '../modules/inventory/barcodeRoute';
import { extractPassToken } from '../modules/visitor/qr';
import { useTheme } from '../theme';
import { haptic } from '../utils/haptics';
import type { RootStackParamList } from './types';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

/**
 * The centre Scan button for people who can do both: one camera, and the
 * code decides the flow. A QR is a visitor pass; a 1D barcode is a product.
 * Roles still apply: a code for a flow the person cannot use is refused
 * with a buzz instead of opening a screen they cannot finish.
 */
export function ScanScreen({ navigation }: Props) {
  const t = useT();
  const { palette } = useTheme();
  const can = useCan();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const isFocused = useIsFocused();
  const [torch, setTorch] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const busy = useRef(false);

  useFocusEffect(
    useCallback(() => {
      busy.current = false;
    }, []),
  );

  const onCodeScanned = useCallback(
    async (codes: Code[]) => {
      if (busy.current) return;
      const code = codes.find((c) => c.value);
      if (!code?.value) return;
      if (code.type === 'qr') {
        if (!can('visitor.checkin.create')) {
          haptic.warn();
          setHint(t('notAllowedScan'));
          return;
        }
        const { token, meta } = extractPassToken(code.value);
        if (!token) return;
        busy.current = true;
        haptic.success();
        navigation.replace('PassResult', { token, meta });
        return;
      }
      if (!can('inventory.receive')) {
        haptic.warn();
        setHint(t('notAllowedScan'));
        return;
      }
      busy.current = true;
      haptic.success();
      const next = await resolveBarcodeRoute(code.value.trim());
      if (next.name === 'Receiving') navigation.replace('Receiving', next.params);
      else navigation.replace('RegisterProduct', next.params);
    },
    [can, navigation, t],
  );

  const codeScanner = useCodeScanner({
    codeTypes: ['qr', ...PRODUCT_CODE_TYPES],
    onCodeScanned: (codes) => void onCodeScanned(codes),
  });

  if (!hasPermission) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: palette.background }]}>
        <Text variant="headlineSmall" style={{ textAlign: 'center', marginBottom: spacing.md }}>
          {t('cameraNeeded')}
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
      <SafeAreaView edges={['top']} style={styles.top}>
        <View style={styles.topRow}>
          <IconButton Icon={X} onPress={() => navigation.goBack()} tone="inverse" />
          <Text variant="titleMedium" color="#fff">
            {t('scanAnything')}
          </Text>
          <IconButton Icon={torch ? Zap : ZapOff} onPress={() => setTorch((v) => !v)} tone="inverse" />
        </View>
      </SafeAreaView>
      <SafeAreaView edges={['bottom']} style={styles.bottom}>
        <Text variant="bodyLarge" color="#fff" style={{ textAlign: 'center', paddingHorizontal: spacing.xl }}>
          {hint ?? t('scanAnythingSub')}
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  frameWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 280, height: 220, borderWidth: 4, borderRadius: radius.xl },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  bottom: { position: 'absolute', bottom: spacing.xxl, left: 0, right: 0 },
});
