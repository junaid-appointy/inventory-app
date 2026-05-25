import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { palette } from '../design';
import { HomeScreen } from '../screens/HomeScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { OutboxScreen } from '../screens/OutboxScreen';
import { ReceivingScreen } from '../screens/ReceivingScreen';
import { RegisterProductScreen } from '../screens/RegisterProductScreen';
import { ScannerScreen } from '../screens/ScannerScreen';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

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

export function RootNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen
          name="Scanner"
          component={ScannerScreen}
          options={{ animation: 'fade' }}
        />
        <Stack.Screen name="Receiving" component={ReceivingScreen} />
        <Stack.Screen name="RegisterProduct" component={RegisterProductScreen} />
        <Stack.Screen name="Outbox" component={OutboxScreen} />
        <Stack.Screen name="Orders" component={OrdersScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
