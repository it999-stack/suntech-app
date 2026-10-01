import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import {
  SafeAreaProvider,
  initialWindowMetrics,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, Image, StyleSheet, ActivityIndicator, Modal, Platform } from 'react-native';
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { Toaster } from 'sonner-native';
import { colors } from './src/theme/theme';

import RootNavigator from './src/navigation/RootNavigator';
import { initDb } from './src/db/client';
import { AppConfigProvider } from './src/state/AppConfigContext';
import { PlanProvider } from './src/state/PlanContext';
import { SiteSettingsProvider } from './src/state/SiteSettingsContext';
import { DrizzleStudioDevTools } from './src/devtools/DrizzleStudioDevTools';
import { initSyncManager } from './src/sync/SyncManager';
import { ModalHostProvider } from './src/components/shared/ModalHost';
import { ErrorBoundary } from './src/components/shared/ErrorBoundary';

function AndroidToastOverlay({ children }: { children: React.ReactNode }) {
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1 }} pointerEvents="box-none">
          {children}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bgImage: { pointerEvents: 'none', height: '100%', width: '100%', position: 'absolute', top: 0, left: 0, opacity: 0.25 },
});

function AppShell({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={colors.backdropGradient} style={{ flex: 1 }}>
      <Image source={require('./assets/bg-image.png')} style={styles.bgImage} resizeMode="cover" />
      <View style={{ flex: 1, paddingTop: insets.top }}>{children}</View>
    </LinearGradient>
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
          <AppShell>
          <NavigationContainer>
            <AppConfigProvider>
              <PlanProvider>
                <SiteSettingsProvider>
                  <ModalHostProvider>
                    <ErrorBoundary>
                      <RootNavigator />
                    </ErrorBoundary>
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
          </AppShell>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
