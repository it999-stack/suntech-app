// src/sync/bootstrap/bootstrapSync.ts
// Orchestrator — iterates registered steps, collects results.
// Never import step classes here directly; use stepRegistry instead.

import { BOOTSTRAP_STEPS } from './stepRegistry';
import type { SyncContext } from './syncContext';
import type { BootstrapResult, StepResult } from './syncResult';
import { setCursor } from '@repositories/syncCursorRepository';

// Steps the delta-pull endpoint depends on for "changes since cursor" to be
// correct — if any of these fail, the cursor must not advance, or delta sync
// would permanently skip whatever that step failed to save (it can never
// backfill data older than the cursor). sync_app_plan (push) and activePlan
// (today's pull) are excluded: their failure doesn't strand data behind an
// advanced cursor.
const CURSOR_GATING_STEPS = new Set([
  'appConfig', 'locations', 'dimensions', 'shifts', 'machines', 'contractors',
  'personnel', 'roleDefaults', 'steps', 'checklistHistory',
]);

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
 * Once all steps have run, the delta-sync cursor is persisted only if none
 * of CURSOR_GATING_STEPS failed — see the gating block below.
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
      console.warn(`[sync] Step "${step.name}" failed (${result.errorKind ?? 'unknown'}):`, result.error);
    } else {
      console.log(`[sync] Step "${step.name}" synced ${result.count} rows.`);
    }

    callbacks?.onStepComplete?.(result);
  }

  // Only persist the delta-sync cursor once every step it depends on
  // actually succeeded — see CURSOR_GATING_STEPS above. A step failure here
  // must leave the cursor untouched so the next sync() call retries full
  // bootstrap instead of switching to delta and permanently stranding
  // whatever failed to save.
  const criticalFailures = steps.filter((s) => CURSOR_GATING_STEPS.has(s.step) && s.error);
  const serverTime = steps.find((s) => s.step === 'checklistHistory')?.serverTime;

  if (criticalFailures.length === 0 && serverTime) {
    await setCursor(ctx.siteId, serverTime);
  } else if (criticalFailures.length > 0) {
    console.warn(
      '[sync] Critical step failure(s) — cursor NOT persisted, next sync will retry full bootstrap:',
      criticalFailures.map((s) => `${s.step} (${s.errorKind}): ${s.error}`)
    );
  }

  const bootstrapResult: BootstrapResult = { steps, totalSyncedAt: Date.now() };
  notifyBootstrapCompleted(bootstrapResult);
  return bootstrapResult;
}