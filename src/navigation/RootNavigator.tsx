import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { View } from 'react-native';
import { useAuth, useCan } from '../auth';
import { OfflineBanner } from '../components/OfflineBanner';
import { getAllowedScreens, getVisibleModules, type ModuleScreen } from '../modules';
import { OrderSessionProvider } from '../modules/inventory/components/OrderSessionContext';
import { LoginScreen } from '../modules/inventory/screens/LoginScreen';
import { useTheme } from '../theme';
import { OutboxScreen } from '../modules/inventory/screens/OutboxScreen';
import { SettingsScreen } from '../modules/inventory/screens/SettingsScreen';
import { ScanScreen } from './ScanScreen';
import { TodayScreen } from './TodayScreen';
import { NoAccessScreen } from './NoAccessScreen';

const Stack = createNativeStackNavigator();

const HUB_ROUTES = new Set(['Today', 'Home', 'GateHome', 'Settings']);

export function RootNavigator() {
  const { palette } = useTheme();
  const { session, ready } = useAuth();

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: palette.primary,
      background: palette.background,
      card: palette.surface,
      text: palette.onSurface,
      border: palette.outlineVariant,
      notification: palette.error,
    },
  };

  const can = useCan();
  const modules = getVisibleModules(can);
  const canScanBoth = can('visitor.checkin.create') && can('inventory.receive');
  // The first registered screen is where the app opens: the launcher when
  // there is a choice, otherwise straight into the only module. Settings and
  // the sync queue belong to the app, not to any one module.
  const screens: ModuleScreen[] = modules.length === 0 ? [] : [
    ...(modules.length > 1 ? [{ name: 'Today', component: TodayScreen }] : []),
    ...modules.flatMap((m) => getAllowedScreens(m, can)),
    // The combined scanner exists only for people who can scan both kinds.
    ...(canScanBoth ? [{ name: 'Scan', component: ScanScreen, options: { animation: 'fade' } }] : []),
    { name: 'Settings', component: SettingsScreen },
    { name: 'Outbox', component: OutboxScreen },
  ];

  return (
    <OrderSessionProvider>
      {/* Global "Offline" banner — pinned above the navigator so every
          screen shows it without needing to wire it locally. Zero
          height when online (no layout shift). */}
      <View style={{ flex: 1 }}>
        <OfflineBanner />
        <NavigationContainer theme={navTheme}>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.background },
              animation: 'slide_from_right',
            }}
          >
            {!ready || !session ? (
              <Stack.Screen name="Login" component={LoginScreen} options={{ animation: 'fade' }} />
            ) : screens.length === 0 ? (
              <Stack.Screen name="NoAccess" component={NoAccessScreen} options={{ animation: 'fade' }} />
            ) : (
              screens.map((s) => (
                <Stack.Screen
                  key={s.name}
                  name={s.name}
                  component={s.component}
                  // Hubs swap like tabs: a quick fade, not a page push.
                  options={(HUB_ROUTES.has(s.name) ? { animation: 'fade', ...s.options } : s.options) as any}
                />
              ))
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </View>
    </OrderSessionProvider>
  );
}
