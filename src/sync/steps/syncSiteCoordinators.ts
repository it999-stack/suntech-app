// src/sync/steps/syncSiteCoordinators.ts
// Syncs the "who do I call" contact list for the user's site from server into
// local SQLite (currently: process_coordinator-role users assigned to the
// site — the exact role is a server-side concern the app doesn't need to know).
//
// Direction: server → app
// Server endpoint: GET /piling/sites/:siteId/coordinators
//
// Only runs once, on a device's very first-ever sync (bootstrap). After that
// the device switches to delta-pull for good — see deltaPull.ts, which
// carries this same entity forward on every subsequent sync.

import type { ISyncStep } from '@sync/bootstrap/ISyncStep';
import type { SyncContext } from '@sync/bootstrap/syncContext';
import type { StepResult } from '@sync/bootstrap/syncResult';
import { toFailedStepResult } from '@sync/bootstrap/stepError';
import { apiClient } from '@services/apiClient';
import { replaceSiteCoordinators } from '@repositories/siteCoordinatorsRepository';
import type { NewPilSiteCoordinator } from '@db/schema';

export class SyncSiteCoordinatorsStep implements ISyncStep {
  readonly name = 'siteCoordinators';

  async run(ctx: SyncContext): Promise<StepResult> {
    const syncedAt = Date.now();
    try {
      const { data } = await apiClient.get(`/piling/sites/${ctx.siteId}/coordinators`);
      const rows: NewPilSiteCoordinator[] = (data as any[]).map((c) => ({
        id: c.id,
        siteId: ctx.siteId,
        name: c.name,
        phone: c.phone ?? null,
        email: c.email ?? null,
        syncedAt,
      }));
      await replaceSiteCoordinators(ctx.siteId, rows);
      return { step: this.name, count: rows.length, syncedAt };
    } catch (err) {
      return toFailedStepResult(this.name, syncedAt, err);
    }
  }
}
