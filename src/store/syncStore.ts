// src/store/syncStore.ts
// Reports sync state to the UI (ProfileScreen's "Sync now" card, the
// RootNavigator setup gate). This store does NOT own a trigger path: it
// observes the sync cycle via onDeltaSyncStatus and mirrors what it sees, so
// state is correct no matter what started the cycle — reconnect, foreground,
// the periodic timer, a local write, login or a manual tap.
//
// It previously drove one trigger path of its own (sync() → runDeltaSync),
// which meant only syncs it had started were ever reflected: every automatic
// cycle ran invisibly and "Last synced" could read stale seconds after a
// successful sync. Triggers now live exclusively in sync/SyncManager.ts.
//
// Bootstrap is the one flow still orchestrated here rather than observed —
// it's a one-time, navigation-blocking sequence whose per-step progress the
// splash screen renders, and it has no steady-state trigger to observe.

import { create } from 'zustand';
import { runBootstrapSync } from '@sync/bootstrap/bootstrapSync';
import { onDeltaSyncStatus } from '@sync/delta/runDeltaSync';
import { syncNow as triggerSyncNow } from '@sync/SyncManager';
import { getLastSyncTime } from '@repositories/pilesRepository';
import type { StepResult, SyncErrorKind } from '@sync/bootstrap/syncResult';

type SyncState = {
  isSyncing: boolean;
  lastSyncedAt: number | null;
  pilesCount: number | null;
  checklistsSynced: number | null;
  error: string | null;
  errorKind: SyncErrorKind | null;
  /** Name of the step currently running (e.g. "piles"), null when idle. Bootstrap only — a delta cycle has no steps. */
  currentStep: string | null;
  /** Steps finished so far in this run, in order. Reset at the start of each bootstrap. */
  completedSteps: StepResult[];

  loadLastSyncTime: (siteId: string) => Promise<void>;
  /** First install / full reset only — see RootNavigator's setup gate. */
  runBootstrap: (siteId: string) => Promise<void>;
  /** Manual "Sync now". Fires the trigger; state arrives via the observer below. */
  syncNow: () => Promise<void>;
};

export const useSyncStore = create<SyncState>((set) => ({
  isSyncing: false,
  lastSyncedAt: null,
  pilesCount: null,
  checklistsSynced: null,
  error: null,
  errorKind: null,
  currentStep: null,
  completedSteps: [],

  loadLastSyncTime: async (siteId: string) => {
    try {
      const ts = await getLastSyncTime(siteId);
      set({ lastSyncedAt: ts });
    } catch {
      // DB not ready or no rows — keep null
    }
  },

  runBootstrap: async (siteId: string) => {
    set({ isSyncing: true, error: null, errorKind: null, currentStep: null, completedSteps: [] });
    try {
      const result = await runBootstrapSync(
        { siteId },
        {
          onStepStart: (stepName) => set({ currentStep: stepName }),
          onStepComplete: (stepResult) =>
            set((state) => ({ completedSteps: [...state.completedSteps, stepResult] })),
        }
      );

      const pilesStep = result.steps.find((s) => s.step === 'piles');
      const appSyncStep = result.steps.find((s) => s.step === 'sync_app_plan');
      const failedStep = result.steps.find((s) => s.error);

      set({
        isSyncing: false,
        lastSyncedAt: result.totalSyncedAt,
        pilesCount: pilesStep?.count ?? null,
        checklistsSynced: appSyncStep?.count ?? null,
        currentStep: null,
        error: failedStep ? failedStep.error! : null,
        errorKind: failedStep ? (failedStep.errorKind ?? 'unknown') : null,
      });
    } catch (err) {
      set({
        isSyncing: false,
        currentStep: null,
        error: 'Sync failed. Please try again later.',
        errorKind: 'unknown',
      });
      throw err;
    }
  },

  syncNow: async () => {
    // Deliberately sets nothing here — isSyncing/lastSyncedAt/error all come
    // from the observer below, on the same code path as an automatic sync.
    // Never rejects: runDeltaSync resolves failures into its result.
    await triggerSyncNow('manual');
  },
}));

// ─── Cycle observer ────────────────────────────────────────────────────────
// Subscribed at module scope so it's live before any trigger can fire —
// RootNavigator imports this store, and App.tsx renders RootNavigator, both
// of which happen before initSyncManager's listeners can produce a cycle.

onDeltaSyncStatus((status) => {
  if (status.phase === 'start') {
    useSyncStore.setState({ isSyncing: true, error: null, errorKind: null });
    return;
  }

  const { result } = status;
  useSyncStore.setState((state) => ({
    isSyncing: false,
    // Only advanced on success. A failed cycle leaves the previous value in
    // place, so "Last synced" keeps meaning "last time data actually landed"
    // rather than "last time we tried".
    lastSyncedAt: result.error ? state.lastSyncedAt : Date.now(),
    checklistsSynced: result.pull?.checklistsApplied ?? state.checklistsSynced,
    currentStep: null,
    error: result.error ?? null,
    errorKind: result.error ? (result.errorKind ?? 'unknown') : null,
  }));
});
