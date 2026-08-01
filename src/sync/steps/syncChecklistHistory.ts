// src/sync/steps/syncChecklistHistory.ts
// Pulls the site's complete checklist/actuals history in one call and
// hydrates it into local SQLite — this is what lets a reinstalled/data-cleared
// device recover ALL past plans, not just today's (see syncActivePlan.ts for
// the "today" step, which still runs after this one to stay authoritative for
// the current day).
//
// Also persists bootstrap-history's `server_time` as the very first Phase 3
// delta-sync cursor — established here, with zero extra network calls, since
// this is already the last data-fetching step of bootstrap.
//
// Direction: server → app
// Server endpoint: GET /piling/sites/:siteId/bootstrap-history

import type { ISyncStep } from '@sync/bootstrap/ISyncStep';
import type { SyncContext } from '@sync/bootstrap/syncContext';
import type { StepResult } from '@sync/bootstrap/syncResult';
import { apiClient } from '@services/apiClient';
import { hydrateChecklistFromServer } from '@repositories/checklistRepository';
import { setCursor } from '@repositories/syncCursorRepository';

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
      if (data.server_time) {
        await setCursor(ctx.siteId, data.server_time as string);
      }
      return { step: this.name, count: checklists.length, syncedAt };
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
