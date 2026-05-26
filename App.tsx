import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth';
import { Text } from './src/design';
import { getDb } from './src/db/database';
import { seedDemoStockIfEmpty } from './src/db/stock';
import { I18nProvider } from './src/i18n';
import { RootNavigator } from './src/navigation/RootNavigator';
import { startSync, stopSync } from './src/sync/syncService';
import { ThemeProvider, useTheme } from './src/theme';

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

function AppShell() {
  const { palette } = useTheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await getDb();
        await seedDemoStockIfEmpty();
        startSync();
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => stopSync();
  }, []);

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <Text variant="headlineSmall" color={palette.error}>
          Startup failed
        </Text>
        <Text
          variant="bodyLarge"
          color={palette.onSurfaceVariant}
          style={{ marginTop: 8, textAlign: 'center' }}
        >
          {error}
        </Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <ActivityIndicator color={palette.primary} size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
