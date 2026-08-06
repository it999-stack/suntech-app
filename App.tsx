import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import RootNavigator from './src/navigation/RootNavigator';
import { initDb } from './src/db/client';
import { PlanProvider } from './src/state/PlanContext';
import { SiteSettingsProvider } from './src/state/SiteSettingsContext';
import { DrizzleStudioDevTools } from './src/devtools/DrizzleStudioDevTools';
import { initSyncManager } from './src/sync/SyncManager';

export default function App() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    const initializeDatabase = async () => {
      try {
        await initDb();
        setDbReady(true);
      } catch (err) {
        console.error('Failed to initialize local DB:', err);
        // Still let the app proceed — worst case, offline login won't work
        setDbReady(true);
      }
    };

    initializeDatabase();
    initSyncManager();
  }, []);

  if (!dbReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <NavigationContainer>
            <PlanProvider>
              <SiteSettingsProvider>
                  <RootNavigator />
                  <StatusBar style="auto" />
                  {__DEV__ && <DrizzleStudioDevTools />}
              </SiteSettingsProvider>
            </PlanProvider>
          </NavigationContainer>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
