// src/sync/steps/syncAreas.ts

import type { ISyncStep } from '@sync/bootstrap/ISyncStep';
import type { SyncContext } from '@sync/bootstrap/syncContext';
import type { StepResult } from '@sync/bootstrap/syncResult';

import { apiClient } from '@services/apiClient';

import { saveAreas } from '@repositories/areasRepository';
import { savePiles } from '@repositories/pilesRepository';

import type {
  NewPilingArea,
  NewPilingPile,
} from '@db/schema';

export class SyncAreasStep implements ISyncStep {
  readonly name = 'areas';

  async run(ctx: SyncContext): Promise<StepResult> {
    const syncedAt = Date.now();

    try {
      const { data } = await apiClient.get(
        `/piling/sites/${ctx.siteId}/areas`,
      );

      const areas: NewPilingArea[] = [];
      const piles: NewPilingPile[] = [];

      for (const area of data as any[]) {
        // Skip the virtual "Unassigned" area if server sends id = null
        if (area.id) {
          areas.push({
            id: area.id,
            siteId: ctx.siteId,
            name: area.name,
            code: area.code ?? null,
            sortOrder: area.sort_order ?? 0,
            isActive: true,
            createdAt: syncedAt,
            updatedAt: syncedAt,
          });
        }

        for (const pile of area.piles) {
          piles.push({
            id: pile.id,
            siteId: ctx.siteId,
            areaId: area.id ?? null,
            pileIdCode: pile.pile_id_code,
            areaLocation: pile.area_location ?? null,
            dimensionId: pile.dimension_id ?? null,
            notes: pile.notes ?? null,
            syncedAt,
          });
        }
      }

      await saveAreas(areas);
      await savePiles(piles);

      return {
        step: this.name,
        count: areas.length,
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