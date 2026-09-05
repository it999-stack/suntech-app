// src/navigation/RootNavigator.tsx
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '@app-types/navigation';
import { useAuthStore } from '@store/authStore';
import { useSyncStore } from '@store/syncStore';
import { useWorkingDateStore } from '@store/workingDateStore';
import { getCursor } from '@repositories/syncCursorRepository';
import type { SyncErrorKind } from '@sync/bootstrap/syncResult';
import { colors, spacing, typography } from '@theme/theme';
import Button from '@components/shared/Button';
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

function InitialSyncErrorScreen({
  onRetry,
  reason,
  kind,
}: {
  onRetry: () => void;
  reason: string | null;
  kind: SyncErrorKind | null;
}) {
  const isNetwork = kind === 'network' || !reason;
  return (
    <LinearGradient
      colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]}
      style={styles.splash}
    >
      <Text style={styles.errorTitle}>{isNetwork ? 'No connection' : "Couldn't finish setup"}</Text>
      <Text style={styles.splashText}>
        {isNetwork
          ? 'Connect to the internet to set up your data. This only happens once per device.'
          // TODO(user-friendly-errors): showing the raw error string here for
          // debugging (e.g. from a field screenshot). Replace with friendly,
          // errorKind-driven copy before this is relied on by non-technical
          // field users.
          : `Setup couldn't complete: ${reason}`}
      </Text>
      <Button label="Retry" onPress={onRetry} style={styles.retryBtn} />
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
  const syncError = useSyncStore((s) => s.error);
  const syncErrorKind = useSyncStore((s) => s.errorKind);

  useEffect(() => {
    bootstrap();
    void useWorkingDateStore.getState().hydrate();
  }, [bootstrap]);

  const siteId = user?.siteId ?? null;

  useEffect(() => {
    if (siteId) void useWorkingDateStore.getState().loadPrimaryShiftStartTime(siteId);
  }, [siteId]);

  // ── Initial-sync gate ──────────────────────────────────────────────────
  // Blocks navigation only when local SQLite has never completed a bootstrap
  // for this site (fresh install, cleared app storage, or a reinstall — all
  // wipe the SQLite file). Detected via the sync cursor rather than pile
  // count: bootstrapSync.ts only persists the cursor once every
  // reference-data step succeeds, so it's a complete "did setup finish"
  // signal that's correct even for a site whose locations have zero piles yet
  // (pile count alone would wrongly stay "unsynced" forever in that case).
  // Steady-state logins (cursor already present) trigger a non-blocking
  // background sync instead of gating anything.
  const [gateChecked, setGateChecked] = useState(false);
  const [needsInitialSync, setNeedsInitialSync] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!token || !siteId || isBootstrapping) return;
    let cancelled = false;
    setGateChecked(false);

    (async () => {
      let cursor = await getCursor(siteId).catch(() => null);
      if (cancelled) return;

      if (cursor == null) {
        // Never bootstrapped — block until we have the core reference data.
        // Re-check getCursor after the attempt rather than trusting sync()'s
        // own success/failure directly: bootstrapSync.ts is the source of
        // truth for whether the cursor was actually safe to persist.
        try {
          await useSyncStore.getState().sync(siteId);
        } catch {
          // Network/unexpected failure — fall through to the re-check below,
          // which will correctly find the cursor still unset.
        }
        if (cancelled) return;
        cursor = await getCursor(siteId).catch(() => null);
      } else {
        triggerBackgroundSync(siteId);
      }

      if (!cancelled) {
        setNeedsInitialSync(cursor == null);
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
      return (
        <InitialSyncErrorScreen
          onRetry={() => setRetryCount((c) => c + 1)}
          reason={syncError}
          kind={syncErrorKind}
        />
      );
    }
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // Transparent so App.tsx's single backdrop gradient shows through —
        // native-stack screens default to an opaque background, which would
        // paint over it.
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
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
  retryBtn: { marginTop: spacing.sm },
});
