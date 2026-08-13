// src/sync/bootstrap/syncResult.ts
// Uniform outcome shapes for individual steps and the full bootstrap run.

export type SyncErrorKind = 'network' | 'server' | 'local' | 'unknown';

export type StepResult = {
  step: string;       // matches ISyncStep.name
  count: number;      // rows synced (0 on error)
  syncedAt: number;   // unix ms
  error?: string;     // set only on failure
  errorKind?: SyncErrorKind; // classification of `error`, set only on failure
  serverTime?: string; // only set by checklistHistory — the delta-sync cursor value, reported for bootstrapSync to persist once the run is confirmed safe
};

export type BootstrapResult = {
  steps: StepResult[];
  totalSyncedAt: number; // unix ms — when the full run completed
};
