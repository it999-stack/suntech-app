// src/sync/steps/syncContractors.ts
// Syncs the site-scoped contractor master list from server into local
// SQLite — backs the "Name of Pile Contractor" / "Name of Cage Contractor"
// dropdown fields on the one-time pile measurements (see
// MeasurementFieldsModal.tsx). Mirrors syncMachines.ts exactly.
//
// Direction: server → app
// Server endpoint: GET /piling/sites/:siteId/contractors

import type { ISyncStep } from '@sync/bootstrap/ISyncStep';
import type { SyncContext } from '@sync/bootstrap/syncContext';
import type { StepResult } from '@sync/bootstrap/syncResult';
import { toFailedStepResult } from '@sync/bootstrap/stepError';
import { apiClient } from '@services/apiClient';
import { saveContractors, deleteContractorsByIds } from '@repositories/contractorsRepository';
import type { NewPilContractor } from '@db/schema';

export class SyncContractorsStep implements ISyncStep {
  readonly name = 'contractors';

  async run(ctx: SyncContext): Promise<StepResult> {
    const syncedAt = Date.now();
    try {
      const { data } = await apiClient.get(`/piling/sites/${ctx.siteId}/contractors`);
      const rows: NewPilContractor[] = (data.items as any[]).map((c) => ({
        id: c.id,
        siteId: c.site_id,
        name: c.name,
        isActive: c.is_active ?? true,
        syncedAt,
      }));
      await saveContractors(rows);
      await deleteContractorsByIds((data.deleted_ids as string[]) ?? []);
      return { step: this.name, count: rows.length, syncedAt };
    } catch (err) {
      return toFailedStepResult(this.name, syncedAt, err);
    }
  }
}
