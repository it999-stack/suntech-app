// src/sync/SyncManager.ts
// Debounced, event-driven trigger registration for the steady-state sync
// cycle (push + delta pull + cursor save — see sync/delta/runDeltaSync.ts).
// Triggers: a new local write, network reconnect, app foreground, a
// periodic timer while foregrounded, or a manual tap.
//
// The actual push (`flushQueue`/`deltaPush`) and the queue-changed listener
// mechanism live in sync/delta/deltaPush.ts (moved there in Phase 3 so that
// module has no dependency on this one — this file needs to import
// runDeltaSync, which itself needs deltaPush, so deltaPush can't also
// depend on this file without a cycle). Re-exported here so existing
// importers (ProfileScreen.tsx, sync/steps/syncAppPlan.ts) don't need to change.

import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuthStore } from '@store/authStore';
import { runDeltaSync } from '@sync/delta/runDeltaSync';

export { deltaPush as flushQueue, onQueueChanged, type FlushResult } from '@sync/delta/deltaPush';

export type SyncTriggerReason = 'new-write' | 'reconnect' | 'foreground' | 'periodic' | 'manual';

const DEBOUNCE_MS = 4000;
const PERIODIC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes, only while foregrounded

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;

/** Collapses rapid-fire triggers into a single push+pull cycle ~DEBOUNCE_MS later. No-ops if no site is assigned yet. */
export function triggerDebounced(_reason: SyncTriggerReason): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const siteId = useAuthStore.getState().user?.siteId;
    if (!siteId) return;
    void runDeltaSync(siteId);
  }, DEBOUNCE_MS);
}

/**
 * Registers the automatic triggers (reconnect, foreground, periodic).
 * Call once at app startup (App.tsx, alongside initDb()).
 */
export function initSyncManager(): void {
  if (initialized) return;
  initialized = true;

  let wasConnected: boolean | null = null;
  NetInfo.addEventListener((state) => {
    const isConnected = !!state.isConnected;
    if (isConnected && wasConnected === false) {
      triggerDebounced('reconnect');
    }
    wasConnected = isConnected;
  });

  AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      triggerDebounced('foreground');
    }
  });

  setInterval(() => {
    if (AppState.currentState === 'active') {
      triggerDebounced('periodic');
    }
  }, PERIODIC_INTERVAL_MS);
}
