// src/sync/steps/syncChecklistHistory.ts
// Pulls the site's complete checklist/actuals history in one call and
// hydrates it into local SQLite — this is what lets a reinstalled/data-cleared
// device recover ALL past plans, not just today's (see syncActivePlan.ts for
// the "today" step, which still runs after this one to stay authoritative for
// the current day).
//
// Also reports bootstrap-history's `server_time` in its StepResult — this is
// the candidate Phase 3 delta-sync cursor value, established here with zero
// extra network calls since this is already the last data-fetching step of
// bootstrap. It's bootstrapSync.ts that actually persists it (via setCursor),
// and only once it's confirmed no critical pull step failed — this step must
// not set the cursor itself, or a failure elsewhere would still advance it.
//
// Direction: server → app
// Server endpoint: GET /piling/sites/:siteId/bootstrap-history

import type { ISyncStep } from '@sync/bootstrap/ISyncStep';
import type { SyncContext } from '@sync/bootstrap/syncContext';
import type { StepResult } from '@sync/bootstrap/syncResult';
import { toFailedStepResult } from '@sync/bootstrap/stepError';
import { apiClient } from '@services/apiClient';
import { hydrateChecklistFromServer } from '@repositories/checklistRepository';

export class SyncChecklistHistoryStep implements ISyncStep {
  readonly name = 'checklistHistory';

  async run(ctx: SyncContext): Promise<StepResult> {
    const syncedAt = Date.now();
    try {
      const { data } = await apiClient.get(`/piling/sites/${ctx.siteId}/bootstrap-history`);
      const checklists = (data.checklists as any[]) ?? [];
      for (const checklist of checklists) {
        await hydrateChecklistFromServer(checklist);
      }
      return {
        step: this.name,
        count: checklists.length,
        syncedAt,
        serverTime: data.server_time as string | undefined,
      };
    } catch (err) {
      return toFailedStepResult(this.name, syncedAt, err);
    }
  }
}
