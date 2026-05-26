import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { useAuth } from '../auth';
import { getAllScreens } from '../modules';
import { LoginScreen } from '../modules/inventory/screens/LoginScreen';
import { useTheme } from '../theme';

const Stack = createNativeStackNavigator();

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

  const screens = getAllScreens();

  return (
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
        ) : (
          screens.map((s) => (
            <Stack.Screen
              key={s.name}
              name={s.name}
              component={s.component}
              options={s.options as any}
            />
          ))
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
