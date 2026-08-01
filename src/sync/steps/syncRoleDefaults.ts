// src/sync/steps/syncRoleDefaults.ts
// Syncs pil_role_defaults for the user's site from server into local SQLite.
//
// Direction: server → app
// Server endpoint: GET /piling/sites/:siteId/role-defaults

import type { ISyncStep } from '@sync/bootstrap/ISyncStep';
import type { SyncContext } from '@sync/bootstrap/syncContext';
import type { StepResult } from '@sync/bootstrap/syncResult';
import { apiClient } from '@services/apiClient';
import { replaceRoleDefaultsForSite } from '@repositories/roleDefaultsRepository';
import type { NewPilingSiteRoleDefault } from '@db/schema';

export class SyncRoleDefaultsStep implements ISyncStep {
  readonly name = 'roleDefaults';

  async run(ctx: SyncContext): Promise<StepResult> {
    const syncedAt = Date.now();
    try {
      const { data } = await apiClient.get(`/piling/sites/${ctx.siteId}/role-defaults`);
      const rows: NewPilingSiteRoleDefault[] = (data as any[]).map((d) => ({
        id: `${ctx.siteId}:${d.role}:${d.machine_id ?? ''}:${d.shift_slot ?? ''}`,
        siteId: ctx.siteId,
        role: d.role,
        machineId: d.machine_id,
        shiftSlot: d.shift_slot,
        personnelId: d.personnel_id,
        syncedAt,
      }));
      await replaceRoleDefaultsForSite(ctx.siteId, rows);
      return { step: this.name, count: rows.length, syncedAt };
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
