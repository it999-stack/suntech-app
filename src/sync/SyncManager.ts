// src/sync/SyncManager.ts
// Sole owner of steady-state sync triggers. Every path that can start a sync
// cycle (push + delta pull + cursor save — see sync/delta/runDeltaSync.ts)
// goes through this module: a new local write, network reconnect, app
// foreground, a periodic timer while foregrounded, login, or a manual tap.
//
// No other module may register its own listeners for these events or call
// runDeltaSync directly. RootNavigator.tsx used to keep a duplicate
// NetInfo/AppState pair of its own, which meant every foreground and
// reconnect ran two full cycles a few seconds apart (runDeltaSync's
// single-flight guard only collapses them when they genuinely overlap, and
// the first usually finished before the second was even scheduled).
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
import { runDeltaSync, type DeltaSyncResult } from '@sync/delta/runDeltaSync';

export { deltaPush as flushQueue, onQueueChanged, type FlushResult } from '@sync/delta/deltaPush';

export type SyncTriggerReason =
  | 'new-write'
  | 'reconnect'
  | 'foreground'
  | 'periodic'
  | 'login'
  | 'manual';

const DEBOUNCE_MS = 4000;
const PERIODIC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes, only while foregrounded

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;

function clearPendingTrigger(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
}

/** Collapses rapid-fire triggers into a single push+pull cycle ~DEBOUNCE_MS later. No-ops if no site is assigned yet. */
export function triggerDebounced(_reason: SyncTriggerReason): void {
  clearPendingTrigger();
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const siteId = useAuthStore.getState().user?.siteId;
    if (!siteId) return;
    void runDeltaSync(siteId);
  }, DEBOUNCE_MS);
}

/**
 * Runs a cycle immediately instead of waiting out the debounce — for triggers
 * a user is watching (a "Sync now" tap) or that fire once and won't repeat
 * (login). Awaitable, so a caller can refresh derived data afterwards.
 *
 * Drops any pending debounced trigger first: it would otherwise fire moments
 * after this cycle finishes and run a near-identical second one. Resolves
 * `{ ran: false }` when no site is assigned or no cursor exists yet — both
 * mean there is nothing to sync, not that something failed.
 */
export function syncNow(_reason: SyncTriggerReason): Promise<DeltaSyncResult> {
  clearPendingTrigger();
  const siteId = useAuthStore.getState().user?.siteId;
  if (!siteId) return Promise.resolve({ ran: false });
  return runDeltaSync(siteId);
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
