import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import {
  SafeAreaProvider,
  initialWindowMetrics,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Modal, Platform } from 'react-native';
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

/**
 * The app's single backdrop + safe-area boundary. Every screen renders inside
 * this, so no screen declares its own gradient or top inset — and, critically,
 * neither does anything a screen renders as a SIBLING of its content (inline
 * overlays like AddPileModal). That sibling case is exactly what used to escape
 * per-screen insets: the padding lived on an inner View, so an absolutely-
 * positioned overlay anchored to the screen's outermost element sat under the
 * status bar.
 *
 * Gradient OUTSIDE the padding, deliberately: it paints the full window
 * including the status-bar strip, while the inset only pushes content down. The
 * reverse order would leave a flat band above the gradient.
 *
 * useSafeAreaInsets, not SafeAreaView: a freshly-pushed native-stack screen can
 * briefly report a stale/zero top inset, and SafeAreaView's internal layout
 * didn't reliably re-apply once the real value landed (see the note this
 * replaces in FillActualScreen). Reading the hook re-renders as soon as the
 * context updates.
 *
 * Top only. Bottom is left to whoever needs it — a bottom sheet wants its
 * background to reach the physical edge while its content clears the home
 * indicator, which is padding-on-content, not a wrapper concern.
 */
function AppShell({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient colors={colors.backdropGradient} style={{ flex: 1 }}>
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
