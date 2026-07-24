// src/sync/SyncManager.ts
// Debounced, event-driven flush of the offline sync queue (pil_sync_queue)
// to the server. Triggers: a new local write, network reconnect, app
// foreground, a periodic timer while foregrounded, or a manual tap.
//
// This is app -> server only. Pull (server -> app reference data) is
// unchanged and still runs via bootstrapSync's pull steps.

import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { apiClient } from '@services/apiClient';
import { useAuthStore } from '@store/authStore';
import {
  getFlushBatch,
  markSyncing,
  markSynced,
  markFailed,
} from '@repositories/syncQueueRepository';
import { getChecklistsForSync } from '@repositories/syncRepository';
import type { SyncAppPlanResponse } from '@sync/SyncAppPlanPayload';

export type SyncTriggerReason = 'new-write' | 'reconnect' | 'foreground' | 'periodic' | 'manual';

const DEBOUNCE_MS = 4000;
const PERIODIC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes, only while foregrounded

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;
let initialized = false;

type QueueChangedListener = () => void;
const listeners = new Set<QueueChangedListener>();

/** Subscribe to be notified after every flush attempt (success or failure) — e.g. to refresh a pending-count badge. */
export function onQueueChanged(listener: QueueChangedListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

/** Collapses rapid-fire triggers into a single flush ~DEBOUNCE_MS later. */
export function triggerDebounced(_reason: SyncTriggerReason): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushQueue();
  }, DEBOUNCE_MS);
}

export type FlushResult = {
  /** Checklists that were dirty and attempted this flush (0 if skipped/no-op). */
  attempted: number;
  synced: number;
  failed: number;
  /** First error message, if any — surfaced to StepResult/UI. */
  error?: string;
};

/**
 * Reads all dirty (pending/failed) checklists, POSTs them to /sync-app, and
 * marks each one synced or failed based on the response. No-ops if offline,
 * already flushing, not logged into a site, or nothing is queued.
 */
export async function flushQueue(): Promise<FlushResult> {
  if (isFlushing) return { attempted: 0, synced: 0, failed: 0 };

  const siteId = useAuthStore.getState().user?.siteId;
  if (!siteId) return { attempted: 0, synced: 0, failed: 0 };

  const netState = await NetInfo.fetch();
  if (!netState.isConnected) return { attempted: 0, synced: 0, failed: 0 };

  const batch = await getFlushBatch();
  if (!batch.length) return { attempted: 0, synced: 0, failed: 0 };

  isFlushing = true;
  const checklistIds = batch.map((row) => row.checklistId);

  try {
    await markSyncing(checklistIds);
    const checklists = await getChecklistsForSync(siteId, checklistIds);

    const { data } = await apiClient.post<SyncAppPlanResponse>(
      `/piling/sites/${siteId}/sync-app`,
      { checklists },
    );

    const errors = data.errors ?? [];
    const failedIds = new Set(errors.map((e) => e.checklist_id));
    const succeededIds = checklistIds.filter((id) => !failedIds.has(id));

    if (succeededIds.length) await markSynced(succeededIds);
    for (const err of errors) {
      await markFailed(err.checklist_id, err.error);
    }

    return {
      attempted: checklistIds.length,
      synced: succeededIds.length,
      failed: errors.length,
      error: errors[0]?.error,
    };
  } catch (err) {
    // Whole-batch failure (e.g. connection dropped mid-request) — leave every
    // checklist in this batch marked failed so the next trigger retries them.
    const message = err instanceof Error ? err.message : String(err);
    for (const id of checklistIds) {
      await markFailed(id, message);
    }
    return { attempted: checklistIds.length, synced: 0, failed: checklistIds.length, error: message };
  } finally {
    isFlushing = false;
    notifyListeners();
  }
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
