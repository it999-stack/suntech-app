// src/sync/steps/syncActivePlan.ts
//
// Pulls today's checklist (if the server has one) into local SQLite on every
// bootstrap — login, reconnect, foreground, periodic (see stepRegistry.ts).
// This is what makes a reinstalled/data-cleared device recover its
// in-progress plan: the device never re-derives or regenerates anything, it
// just rehydrates from the server, which is the sole owner of plan data
// (see suntech-core/modules/piling/daily_checklists/plan_generation_service.py).
//
// A no-op (count 0, no error) when today has no plan yet — that's the normal
// state before "Generate Plan" has been used, not a failure.

import type { ISyncStep } from '@sync/bootstrap/ISyncStep';
import type { SyncContext } from '@sync/bootstrap/syncContext';
import type { StepResult } from '@sync/bootstrap/syncResult';

import { apiClient } from '@services/apiClient';
import { hydrateChecklistFromServer } from '@repositories/checklistRepository';

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export class SyncActivePlanStep implements ISyncStep {
  readonly name = 'activePlan';

  async run(ctx: SyncContext): Promise<StepResult> {
    const syncedAt = Date.now();

    try {
      const today = toLocalDateStr(new Date());
      const { data: state } = await apiClient.get<{ exists: boolean; checklist_id: string | null }>(
        `/piling/sites/${ctx.siteId}/plans/state`,
        { params: { date: today } },
      );

      if (!state.exists || !state.checklist_id) {
        return { step: this.name, count: 0, syncedAt };
      }

      const { data: checklist } = await apiClient.get(`/piling/checklists/${state.checklist_id}`);
      await hydrateChecklistFromServer(checklist);

      return { step: this.name, count: 1, syncedAt };
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
