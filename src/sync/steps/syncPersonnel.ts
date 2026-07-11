// src/sync/steps/syncPersonnel.ts
// Syncs piling_site_personnel for the user's site from server into local SQLite.
//
// Direction: server → app
// Server endpoint: GET /piling/sites/:siteId/personnel

import type { ISyncStep } from '@sync/bootstrap/ISyncStep';
import type { SyncContext } from '@sync/bootstrap/syncContext';
import type { StepResult } from '@sync/bootstrap/syncResult';
import { apiClient } from '@services/apiClient';
import { savePersonnel } from '@repositories/personnelRepository';
import type { NewPilingPersonnel } from '@db/schema';

export class SyncPersonnelStep implements ISyncStep {
  readonly name = 'personnel';

  async run(ctx: SyncContext): Promise<StepResult> {
    const syncedAt = Date.now();
    try {
      const { data } = await apiClient.get(`/piling/sites/${ctx.siteId}/personnel`);
      const rows: NewPilingPersonnel[] = (data as any[]).map((p) => ({
        id: p.id,
        siteId: p.site_id,
        name: p.name,
        designation: p.designation,
        phone: p.phone ?? null,
        email: p.email ?? null,
        employeeCode: p.employee_code ?? null,
        isActive: p.is_active ?? true,
        syncedAt,
      }));
      await savePersonnel(rows);
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
