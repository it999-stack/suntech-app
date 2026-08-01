// src/sync/delta/deltaPush.ts
// Reads all dirty (pending/failed) checklists and POSTs them to
// /sync/push. Moved out of SyncManager.ts (Phase 3) so this file has no
// dependency on SyncManager — runDeltaSync.ts needs both this and
// SyncManager's own triggers to call it without a circular import.

import { apiClient } from '@services/apiClient';
import { useAuthStore } from '@store/authStore';
import {
  getFlushBatch,
  markSyncing,
  markSynced,
  markFailed,
} from '@repositories/syncQueueRepository';
import { getChecklistsForSync } from '@repositories/syncRepository';
import type { SyncAppPlanResponse, SyncConflict } from '@sync/SyncAppPlanPayload';

export type FlushResult = {
  /** Checklists that were dirty and attempted this flush (0 if skipped/no-op). */
  attempted: number;
  synced: number;
  failed: number;
  /** First error message, if any — surfaced to StepResult/UI. */
  error?: string;
  /** Per-row conflicts reported by the server — informational only in Phase 3
   * (see runDeltaSync.ts: the pull that follows corrects the local value). */
  conflicts?: SyncAppPlanResponse['conflicts'];
};

let isFlushing = false;

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

type ConflictListener = (conflicts: SyncConflict[]) => void;
const conflictListeners = new Set<ConflictListener>();

/**
 * Subscribe to be notified whenever a flush's response reports genuine
 * per-row conflicts (a rarer case once optimistic-concurrency versioning
 * uses the server-echoed updated_at instead of the device clock) — e.g. to
 * surface a one-time "updated elsewhere" notice instead of silently
 * discarding the local edit. Not fired on whole-batch transport failures
 * (the catch branch below), only on a successful response that itself
 * contains conflicts.
 */
export function onConflicts(listener: ConflictListener): () => void {
  conflictListeners.add(listener);
  return () => conflictListeners.delete(listener);
}

function notifyConflicts(conflicts: SyncConflict[] | undefined): void {
  if (!conflicts?.length) return;
  conflictListeners.forEach((listener) => listener(conflicts));
}

/**
 * No-ops if offline, already flushing, not logged into a site, or nothing is
 * queued.
 */
export async function deltaPush(): Promise<FlushResult> {
  if (isFlushing) return { attempted: 0, synced: 0, failed: 0 };

  const siteId = useAuthStore.getState().user?.siteId;
  if (!siteId) return { attempted: 0, synced: 0, failed: 0 };

  const batch = await getFlushBatch();
  if (!batch.length) return { attempted: 0, synced: 0, failed: 0 };

  isFlushing = true;
  const checklistIds = batch.map((row) => row.checklistId);

  try {
    await markSyncing(checklistIds);
    const checklists = await getChecklistsForSync(siteId, checklistIds);

    const { data } = await apiClient.post<SyncAppPlanResponse>(
      `/piling/sites/${siteId}/sync/push`,
      { checklists },
    );

    const errors = data.errors ?? [];
    const failedIds = new Set(errors.map((e) => e.checklist_id));
    const succeededIds = checklistIds.filter((id) => !failedIds.has(id));

    // Conflicting rows are NOT retried (retrying a lost conflict is
    // pointless) but the checklist they belong to is still marked synced —
    // the delta pull that immediately follows (see runDeltaSync.ts) corrects
    // the local value from the server's truth.
    if (succeededIds.length) await markSynced(succeededIds);
    for (const err of errors) {
      await markFailed(err.checklist_id, err.error);
    }

    notifyConflicts(data.conflicts);

    return {
      attempted: checklistIds.length,
      synced: succeededIds.length,
      failed: errors.length,
      error: errors[0]?.error,
      conflicts: data.conflicts,
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
