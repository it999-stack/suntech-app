// src/sync/bootstrap/ISyncStep.ts
// Contract every sync step must satisfy.
// Open/Closed: add new steps by creating new classes — never touch the orchestrator.

import type { SyncContext } from './syncContext';
import type { StepResult } from './syncResult';

export interface ISyncStep {
  /** Human-readable name used in logs and result reporting. */
  readonly name: string;

  /** Execute the sync. Must resolve (never reject) — wrap errors into StepResult.error. */
  run(ctx: SyncContext): Promise<StepResult>;
}
