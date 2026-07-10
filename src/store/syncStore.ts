// src/store/syncStore.ts
// Manages sync state for the ProfileScreen "Sync now" button.
// All sync logic lives in src/sync/ — this store is just state + orchestration glue.

import { create } from 'zustand';
import { runBootstrapSync } from '../sync/bootstrap/bootstrapSync';
import { getLastSyncTime } from '../repositories/pilesRepository';
import type { StepResult } from '../sync/bootstrap/syncResult';

type SyncState = {
  isSyncing: boolean;
  lastSyncedAt: number | null;
  pilesCount: number | null;
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
      const result = await runBootstrapSync(
        { siteId },
        {
          onStepStart: (stepName) => set({ currentStep: stepName }),
          onStepComplete: (stepResult) =>
            set((state) => ({ completedSteps: [...state.completedSteps, stepResult] })),
        }
      );

      const pilesStep = result.steps.find((s) => s.step === 'piles');
      const pilesCount = pilesStep?.count ?? null;
      const failedStep = result.steps.find((s) => s.error);

      set({
        isSyncing: false,
        lastSyncedAt: result.totalSyncedAt,
        pilesCount,
        currentStep: null,
        error: failedStep ? failedStep.error! : null,
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