// src/sync/bootstrap/bootstrapSync.ts
// Orchestrator — iterates registered steps, collects results.
// Never import step classes here directly; use stepRegistry instead.

import { BOOTSTRAP_STEPS } from './stepRegistry';
import type { SyncContext } from './syncContext';
import type { BootstrapResult, StepResult } from './syncResult';

export interface BootstrapSyncCallbacks {
  /** Called right before a step starts running. */
  onStepStart?: (stepName: string) => void;
  /** Called right after a step finishes, success or failure. */
  onStepComplete?: (result: StepResult) => void;
}

// ─── Pull-completed notifications ──────────────────────────────────────────
// Mirrors SyncManager.ts's onQueueChanged, but for the pull side: fires once
// per full runBootstrapSync() call so long-lived consumers (e.g. PlanContext)
// can refresh from local SQLite without polling or per-screen focus effects —
// this is what makes "sync happened" actually show up in already-mounted UI.

type BootstrapCompletedListener = (result: BootstrapResult) => void;
const bootstrapListeners = new Set<BootstrapCompletedListener>();

export function onBootstrapCompleted(listener: BootstrapCompletedListener): () => void {
  bootstrapListeners.add(listener);
  return () => bootstrapListeners.delete(listener);
}

function notifyBootstrapCompleted(result: BootstrapResult): void {
  bootstrapListeners.forEach((listener) => listener(result));
}

/**
 * Runs all registered bootstrap sync steps sequentially.
 * Each step is responsible for its own error handling — a failing step
 * records an error in its StepResult but does not abort the rest of the run.
 *
 * @param ctx        The sync context (siteId for the logged-in user).
 * @param callbacks  Optional progress hooks for UI to observe step-by-step state.
 * @returns          A BootstrapResult summarising what each step synced.
 */
export async function runBootstrapSync(
  ctx: SyncContext,
  callbacks?: BootstrapSyncCallbacks
): Promise<BootstrapResult> {
  const steps: StepResult[] = [];

  for (const step of BOOTSTRAP_STEPS) {
    callbacks?.onStepStart?.(step.name);

    const result = await step.run(ctx);
    steps.push(result);

    if (result.error) {
      console.warn(`[sync] Step "${step.name}" failed:`, result.error);
    } else {
      console.log(`[sync] Step "${step.name}" synced ${result.count} rows.`);
    }

    callbacks?.onStepComplete?.(result);
  }

  const bootstrapResult: BootstrapResult = { steps, totalSyncedAt: Date.now() };
  notifyBootstrapCompleted(bootstrapResult);
  return bootstrapResult;
}