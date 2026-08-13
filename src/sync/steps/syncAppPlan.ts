// src/sync/steps/syncAppPlan.ts
// Bootstrap step that flushes the offline sync queue (pil_sync_queue) to the
// server. All the read/POST/retry logic lives in SyncManager — this step is
// just the bridge so "Sync now" (bootstrapSync) triggers the same flush that
// automatic triggers (reconnect/foreground/periodic/new-write) use.

import type { ISyncStep } from '@sync/bootstrap/ISyncStep';
import type { SyncContext } from '@sync/bootstrap/syncContext';
import type { StepResult } from '@sync/bootstrap/syncResult';
import { toFailedStepResult } from '@sync/bootstrap/stepError';

import { flushQueue } from '@sync/SyncManager';

export class SyncAppPlanStep implements ISyncStep {
  readonly name = 'sync_app_plan';

  async run(_ctx: SyncContext): Promise<StepResult> {
    const syncedAt = Date.now();

    try {
      const result = await flushQueue();
      return {
        step: this.name,
        count: result.synced,
        syncedAt,
        error: result.failed > 0 ? result.error : undefined,
      };
    } catch (err) {
      return toFailedStepResult(this.name, syncedAt, err);
    }
  }
}
