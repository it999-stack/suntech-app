// src/sync/steps/syncLocations.ts

import type { ISyncStep } from '@sync/bootstrap/ISyncStep';
import type { SyncContext } from '@sync/bootstrap/syncContext';
import type { StepResult } from '@sync/bootstrap/syncResult';
import { toFailedStepResult } from '@sync/bootstrap/stepError';

import { apiClient } from '@services/apiClient';

import { saveLocations } from '@repositories/locationsRepository';
import { savePiles, deletePilesByIds } from '@repositories/pilesRepository';

import type {
  NewPilingLocation,
  NewPilingPile,
} from '@db/schema';

export class SyncLocationsStep implements ISyncStep {
  readonly name = 'locations';

  async run(ctx: SyncContext): Promise<StepResult> {
    const syncedAt = Date.now();

    try {
      const { data } = await apiClient.get(
        `/piling/sites/${ctx.siteId}/locations`,
      );

      const locations: NewPilingLocation[] = [];
      const piles: NewPilingPile[] = [];

      for (const location of data.locations as any[]) {
        // Skip the virtual "Unassigned" location if server sends id = null
        if (location.id) {
          locations.push({
            id: location.id,
            siteId: ctx.siteId,
            name: location.name,
            code: location.code ?? null,
            sortOrder: location.sort_order ?? 0,
            isActive: true,
            createdAt: syncedAt,
            updatedAt: syncedAt,
          });
        }

        for (const pile of location.piles) {
          piles.push({
            id: pile.id,
            siteId: ctx.siteId,
            locationId: location.id ?? null,
            pileIdCode: pile.pile_id_code,
            area: pile.area ?? null,
            dimensionId: pile.dimension_id ?? null,
            notes: pile.notes ?? null,
            syncedAt,
          });
        }
      }

      await saveLocations(locations);
      await savePiles(piles);
      await deletePilesByIds((data.deleted_pile_ids as string[]) ?? []);

      return {
        step: this.name,
        count: locations.length,
        syncedAt,
      };
    } catch (err) {
      return toFailedStepResult(this.name, syncedAt, err);
    }
  }
}
