// src/store/syncStore.ts
// Manages sync state for the ProfileScreen "Sync now" button.
// All sync logic lives in src/sync/ — this store is just state + orchestration glue.

import { create } from 'zustand';
import { runBootstrapSync } from '@sync/bootstrap/bootstrapSync';
import { runDeltaSync } from '@sync/delta/runDeltaSync';
import { getCursor } from '@repositories/syncCursorRepository';
import { getLastSyncTime } from '@repositories/pilesRepository';
import type { StepResult } from '@sync/bootstrap/syncResult';

type SyncState = {
  isSyncing: boolean;
  lastSyncedAt: number | null;
  pilesCount: number | null;
  checklistsSynced: number | null;
  error: string | null;
  /** Name of the step currently running (e.g. "piles"), null when idle. */
  currentStep: string | null;
  /** Steps finished so far in this run, in order. Reset at the start of each sync. */
  completedSteps: StepResult[];

  loadLastSyncTime: (siteId: string) => Promise<void>;
  sync: (siteId: string) => Promise<void>;
};

export const useSyncStore = create<SyncState>((set) => ({
  isSyncing: false,
  lastSyncedAt: null,
  pilesCount: null,
  checklistsSynced: null,
  error: null,
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

  sync: async (siteId: string) => {
    set({ isSyncing: true, error: null, currentStep: null, completedSteps: [] });
    try {
      // No cursor yet — never bootstrapped (fresh install/reset) — run the
      // full bootstrap. Once a cursor exists, steady state is push + delta
      // pull only; bootstrap never runs again for this device.
      const cursor = await getCursor(siteId);

      if (!cursor) {
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
        const pilesCount = pilesStep?.count ?? null;
        const checklistsSynced = appSyncStep?.count ?? null;
        const failedStep = result.steps.find((s) => s.error);

        set({
          isSyncing: false,
          lastSyncedAt: result.totalSyncedAt,
          pilesCount,
          checklistsSynced,
          currentStep: null,
          error: failedStep ? failedStep.error! : null,
        });
        return;
      }

      const result = await runDeltaSync(siteId);
      set({
        isSyncing: false,
        lastSyncedAt: Date.now(),
        checklistsSynced: result.pull?.checklistsApplied ?? null,
        currentStep: null,
        error: result.error ?? null,
      });
    } catch (err) {
      set({
        isSyncing: false,
        currentStep: null,
        error: 'Sync failed. Please try again later.',
      });
      throw err;
    }
  },
}));