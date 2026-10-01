// src/navigation/RootNavigator.tsx
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '@app-types/navigation';
import { useAuthStore } from '@store/authStore';
import { useSyncStore } from '@store/syncStore';
import { useWorkingDateStore } from '@store/workingDateStore';
import { getCursor } from '@repositories/syncCursorRepository';
import { syncNow } from '@sync/SyncManager';
import type { SyncErrorKind } from '@sync/bootstrap/syncResult';
import { colors, spacing, typography } from '@theme/theme';
import Button from '@components/shared/Button';
import MainTabNavigator from '@navigation/MainTabNavigator';
import AuthStackNavigator from '@navigation/AuthStackNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

function SplashScreen({ message }: { message?: string }) {
  const [messageIndex, setMessageIndex] = useState(0);

  const messages = [
    'Setting up your workspace…',
    'Syncing site information…',
    'Loading piles and dimensions…',
    'Preparing machines and personnel…',
    'Syncing checklist and actual records…',
    'Finalizing your site data…',
    'Almost ready…',
  ];

  useEffect(() => {
    if (!message) return;

    const interval = setInterval(() => {
      setMessageIndex((current) =>
        Math.min(current + 1, messages.length - 1)
      );
    }, 7000);

    return () => clearInterval(interval);
  }, [message]);

  return (
    <LinearGradient
      colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]}
      style={styles.splash}
    >
      <ActivityIndicator size="large" color={colors.accent} />

      {message && (
        <Text style={styles.splashText}>
          {messages[messageIndex]}
        </Text>
      )}
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
          : `Setup couldn't complete: ${reason}`}
      </Text>
      <Button label="Retry" onPress={onRetry} style={styles.retryBtn} />
    </LinearGradient>
  );
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
  // Once a cursor exists — whether it was already there (steady-state login)
  // or bootstrap just set it (fresh install) — a non-blocking 'login' trigger
  // fires instead of gating anything, so the first delta pull (which is what
  // actually populates site_config/target piles; bootstrap itself doesn't)
  // lands as soon as possible either way. Login is the one steady-state
  // trigger SyncManager can't raise on its own — no AppState or connectivity
  // change accompanies it — so it's raised here, but still through
  // SyncManager rather than by calling runDeltaSync directly.
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
        // Re-check getCursor after the attempt rather than trusting
        // runBootstrap's own success/failure directly: bootstrapSync.ts is
        // the source of truth for whether the cursor was actually safe to
        // persist.
        try {
          await useSyncStore.getState().runBootstrap(siteId);
        } catch {
          // Network/unexpected failure — fall through to the re-check below,
          // which will correctly find the cursor still unset.
        }
        if (cancelled) return;
        cursor = await getCursor(siteId).catch(() => null);
      }

      // Centralized: one 'login' trigger for both paths above, not one per
      // branch. Bootstrap never fetches site_config (target/completed piles
      // — that's delta-pull's job, see deltaPull.ts's saveSiteTargets), so a
      // fresh install needs this exactly as much as a returning login does —
      // without it, pil_sites stays empty locally and SiteTargetCard falls
      // back to raw pile-derived totals until whatever sync trigger happens
      // next. Non-blocking: this only fires once a cursor exists, so it never
      // gates the initial-sync screen below.
      if (cursor != null) {
        void syncNow('login');
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

  // Reconnect, foreground and periodic triggers are registered once by
  // initSyncManager() (App.tsx) and are not duplicated here — see the
  // ownership note at the top of sync/SyncManager.ts. They need no gating on
  // needsInitialSync either: runDeltaSync no-ops while no cursor exists,
  // which is exactly the state that flag describes.

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
