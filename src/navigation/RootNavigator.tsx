// src/navigation/RootNavigator.tsx
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '@app-types/navigation';
import { useAuthStore } from '@store/authStore';
import { useSyncStore } from '@store/syncStore';
import { useWorkingDateStore } from '@store/workingDateStore';
import { getLastSyncTime } from '@repositories/pilesRepository';
import { colors, spacing, radius, typography } from '@theme/theme';
import MainTabNavigator from '@navigation/MainTabNavigator';
import AuthStackNavigator from '@navigation/AuthStackNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

function SplashScreen({ message }: { message?: string }) {
  return (
    <LinearGradient
      colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]}
      style={styles.splash}
    >
      <ActivityIndicator size="large" color={colors.accent} />
      {message && <Text style={styles.splashText}>{message}</Text>}
    </LinearGradient>
  );
}

function InitialSyncErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <LinearGradient
      colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]}
      style={styles.splash}
    >
      <Text style={styles.errorTitle}>No connection</Text>
      <Text style={styles.splashText}>
        Connect to the internet to set up your data. This only happens once per device.
      </Text>
      <Pressable style={styles.retryBtn} onPress={onRetry}>
        <Text style={styles.retryBtnText}>Retry</Text>
      </Pressable>
    </LinearGradient>
  );
}

/** Fire-and-forget bootstrap sync — no-ops if one is already in flight. */
function triggerBackgroundSync(siteId: string): void {
  if (useSyncStore.getState().isSyncing) return;
  void useSyncStore.getState().sync(siteId);
}

export default function RootNavigator() {
  const { token, user, isBootstrapping, bootstrap } = useAuthStore();
  const isSyncing = useSyncStore((s) => s.isSyncing);

  useEffect(() => {
    bootstrap();
    void useWorkingDateStore.getState().hydrate();
  }, [bootstrap]);

  const siteId = user?.siteId ?? null;

  // ── Initial-sync gate ──────────────────────────────────────────────────
  // Blocks navigation only when local SQLite has never been synced for this
  // site (fresh install, cleared app storage, or a reinstall — all wipe the
  // SQLite file). Detected via getLastSyncTime, which already exists for
  // ProfileScreen's "last synced" display and naturally returns null when
  // no piles are cached locally — no new flag/table needed. Steady-state
  // logins (data already present) trigger a non-blocking background sync
  // instead of gating anything.
  const [gateChecked, setGateChecked] = useState(false);
  const [needsInitialSync, setNeedsInitialSync] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!token || !siteId || isBootstrapping) return;
    let cancelled = false;
    setGateChecked(false);

    (async () => {
      let lastSync = await getLastSyncTime(siteId).catch(() => null);
      if (cancelled) return;

      if (lastSync == null) {
        // Never synced — block until we have at least the core reference
        // data. Re-check getLastSyncTime after the attempt rather than
        // trusting sync()'s own success/failure directly: a single step
        // erroring elsewhere (e.g. duration templates) shouldn't block
        // forever if the piles step itself got through.
        try {
          await useSyncStore.getState().sync(siteId);
        } catch {
          // Network/unexpected failure — fall through to the re-check below,
          // which will correctly find still-empty local data.
        }
        if (cancelled) return;
        lastSync = await getLastSyncTime(siteId).catch(() => null);
      } else {
        triggerBackgroundSync(siteId);
      }

      if (!cancelled) {
        setNeedsInitialSync(lastSync == null);
        setGateChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, siteId, isBootstrapping, retryCount]);

  // ── Steady-state background sync: reconnect + foreground ──────────────
  // Login is covered by the gate effect above; this covers "app was already
  // open/backgrounded and connectivity or foreground state changed." No
  // periodic timer — a full bootstrap pull hits ~6 endpoints, so
  // reconnect/foreground is enough coverage without hammering the server.
  useEffect(() => {
    // Also gated on gateChecked — needsInitialSync starts false by default,
    // before the check above has even run, so without this a reconnect
    // event could theoretically fire during that brief ambiguous window.
    if (!siteId || !gateChecked || needsInitialSync) return;

    let wasConnected: boolean | null = null;
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const isConnected = !!state.isConnected;
      if (isConnected && wasConnected === false) {
        triggerBackgroundSync(siteId);
      }
      wasConnected = isConnected;
    });

    const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        triggerBackgroundSync(siteId);
      }
    });

    return () => {
      unsubscribeNet();
      appStateSub.remove();
    };
  }, [siteId, gateChecked, needsInitialSync]);

  if (isBootstrapping) {
    return <SplashScreen />;
  }

  const isLoggedIn = !!token;

  if (isLoggedIn) {
    if (!gateChecked || (needsInitialSync && isSyncing)) {
      return <SplashScreen message="Setting up your workspace…" />;
    }
    if (needsInitialSync) {
      return <InitialSyncErrorScreen onRetry={() => setRetryCount((c) => c + 1)} />;
    }
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isLoggedIn ? (
        <Stack.Screen name="Main" component={MainTabNavigator} />
      ) : (
        <Stack.Screen name="Auth" component={AuthStackNavigator} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  splashText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  errorTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  retryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  retryBtnText: {
    ...typography.buttonLabel,
    color: colors.textInverse,
  },
});
