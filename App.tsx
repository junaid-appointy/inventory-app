import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palette, Text } from './src/design';
import { getDb } from './src/db/database';
import { RootNavigator } from './src/navigation/RootNavigator';
import { startSync, stopSync } from './src/sync/syncService';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await getDb();
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
      <View style={styles.center}>
        <Text variant="headlineSmall" color={palette.error}>
          Startup failed
        </Text>
        <Text variant="bodyLarge" color={palette.onSurfaceVariant} style={{ marginTop: 8, textAlign: 'center' }}>
          {error}
        </Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
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
    backgroundColor: palette.background,
    padding: 24,
  },
});
