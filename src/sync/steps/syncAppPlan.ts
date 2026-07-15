// src/sync/steps/syncAppPlan.ts
// Sync step that pushes locally generated plan data and actual times to the server.

import type { ISyncStep } from '@sync/bootstrap/ISyncStep';
import type { SyncContext } from '@sync/bootstrap/syncContext';
import type { StepResult } from '@sync/bootstrap/syncResult';

import { apiClient } from '@services/apiClient';
import { getChecklistsForSync } from '@repositories/syncRepository';
import type { SyncAppPlanResponse } from '@sync/SyncAppPlanPayload';

export class SyncAppPlanStep implements ISyncStep {
  readonly name = 'sync_app_plan';

  async run(ctx: SyncContext): Promise<StepResult> {
    const syncedAt = Date.now();

    try {
      // 1. Fetch all checklists with complete data from local SQLite
      const checklists = await getChecklistsForSync(ctx.siteId);

      if (checklists.length === 0) {
        // No checklists to sync is a valid state, not an error
        return {
          step: this.name,
          count: 0,
          syncedAt,
        };
      }

      // 2. Send to server
      const { data } = await apiClient.post<SyncAppPlanResponse>(
        `/piling/sites/${ctx.siteId}/sync-app`,
        { checklists },
      );

      return {
        step: this.name,
        count: Number(data.checklists_synced) || checklists.length,
        syncedAt,
      };
    } catch (err) {
      return {
        step: this.name,
        count: 0,
        syncedAt,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}