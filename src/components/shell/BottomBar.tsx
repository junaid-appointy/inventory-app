import { StackActions, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScanLine } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, Text } from '../../design';
import { useCan } from '../../auth';
import { useT } from '../../i18n';
import type { StringKey } from '../../i18n/strings';
import type { RootStackParamList } from '../../navigation/types';
import { useTheme } from '../../theme';
import { haptic } from '../../utils/haptics';
import { type Hub, type HubRoute, useHubs } from './hubs';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Bottom bar on hub screens, with the scanner as a raised centre button.
 * Tabs behave like tabs on a plain stack: the stack never holds more than
 * the first hub plus one other, so Android back goes to the first tab and
 * then out of the app.
 */
export function BottomBar() {
  const t = useT();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const { hubs, scanRoute } = useHubs();
  const can = useCan();

  // The only scan button in the app. It stays in one place and takes its
  // meaning from the page: items on Inventory, passes on Visitors, either
  // on Today/More. Hidden where the person's job has nothing to scan.
  const scan: { route: 'Scan' | 'GateScan' | 'Scanner'; labelKey: StringKey } | null =
    route.name === 'Home'
      ? can('inventory.receive') ? { route: 'Scanner', labelKey: 'tabScanItem' } : null
      : route.name === 'GateHome'
        ? can('visitor.checkin.create') ? { route: 'GateScan', labelKey: 'tabScanPass' } : null
        : scanRoute
          ? { route: scanRoute, labelKey: scanRoute === 'Scanner' ? 'tabScanItem' : scanRoute === 'GateScan' ? 'tabScanPass' : 'tabScan' }
          : null;

  const go = (target: HubRoute) => {
    if (target === route.name) return;
    haptic.tap();
    const first = navigation.getState().routes[0]?.name;
    if (target === first || route.name === first) navigation.navigate(target as never);
    else navigation.dispatch(StackActions.replace(target));
  };

  const mid = Math.ceil(hubs.length / 2);

  const tab = (h: Hub) => {
    const active = h.route === route.name;
    const color = active ? palette.primary : palette.onSurfaceVariant;
    return (
      <Pressable key={h.route} onPress={() => go(h.route)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: active }}>
        <View style={[styles.pill, active && { backgroundColor: palette.primaryContainer }]}>
          <h.Icon size={22} color={active ? palette.onPrimaryContainer : color} strokeWidth={active ? 2.4 : 2} />
        </View>
        <Text variant="labelMedium" color={color} style={{ fontWeight: active ? '700' : '500' }}>
          {t(h.labelKey)}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: palette.surfaceContainerLowest, borderTopColor: palette.outlineVariant, paddingBottom: Math.max(insets.bottom, spacing.sm) },
      ]}
    >
      {hubs.slice(0, mid).map(tab)}
      {scan ? (
        <View style={styles.tab}>
          <Pressable
            onPress={() => {
              haptic.tap();
              navigation.navigate(scan.route as never);
            }}
            accessibilityRole="button"
            accessibilityLabel={t(scan.labelKey)}
            style={({ pressed }) => [
              styles.fab,
              { backgroundColor: pressed ? palette.primaryContainer : palette.primary, shadowColor: palette.primary, borderColor: palette.surfaceContainerLowest },
            ]}
          >
            <ScanLine size={28} color={palette.onPrimary} strokeWidth={2.4} />
          </Pressable>
          <Text variant="labelMedium" color={palette.primary} numberOfLines={1} style={{ fontWeight: '700' }}>
            {t(scan.labelKey)}
          </Text>
        </View>
      ) : null}
      {hubs.slice(mid).map(tab)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-end', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  pill: { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -30,
    borderWidth: 4,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
