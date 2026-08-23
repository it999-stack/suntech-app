import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Modal, Platform } from 'react-native';
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Toaster } from 'sonner-native';

import RootNavigator from './src/navigation/RootNavigator';
import { initDb } from './src/db/client';
import { AppConfigProvider } from './src/state/AppConfigContext';
import { PlanProvider } from './src/state/PlanContext';
import { SiteSettingsProvider } from './src/state/SiteSettingsContext';
import { DrizzleStudioDevTools } from './src/devtools/DrizzleStudioDevTools';
import { initSyncManager } from './src/sync/SyncManager';
import { ModalHostProvider } from './src/components/shared/ModalHost';

function AndroidToastOverlay({ children }: { children: React.ReactNode }) {
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent>
      {/* Matches AppModal's own fix: RN's Modal renders into its own native
          root, which the app-level GestureHandlerRootView above doesn't
          extend into — without this, the toast's swipe-to-dismiss gesture
          would silently stop working whenever this overlay is active. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1 }} pointerEvents="box-none">
          {children}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

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
            <AppConfigProvider>
              <PlanProvider>
                <SiteSettingsProvider>
                  <ModalHostProvider>
                    <RootNavigator />
                    <Toaster
                      position="top-center"
                      swipeToDismissDirection="up"
                      ToasterOverlayWrapper={Platform.OS === 'android' ? AndroidToastOverlay : undefined}
                    />
                    <StatusBar style="auto" />
                    {__DEV__ && <DrizzleStudioDevTools />}
                  </ModalHostProvider>
                </SiteSettingsProvider>
              </PlanProvider>
            </AppConfigProvider>
          </NavigationContainer>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
