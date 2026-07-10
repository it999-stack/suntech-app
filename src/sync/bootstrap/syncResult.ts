// src/sync/bootstrap/syncResult.ts
// Uniform outcome shapes for individual steps and the full bootstrap run.

export type StepResult = {
  step: string;       // matches ISyncStep.name
  count: number;      // rows synced (0 on error)
  syncedAt: number;   // unix ms
  error?: string;     // set only on failure
};

export type BootstrapResult = {
  steps: StepResult[];
  totalSyncedAt: number; // unix ms — when the full run completed
};
