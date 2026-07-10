// src/sync/steps/syncPiles.ts
// Syncs piling_piles for the user's site from server into local SQLite.

import type { ISyncStep } from '../bootstrap/ISyncStep';
import type { SyncContext } from '../bootstrap/syncContext';
import type { StepResult } from '../bootstrap/syncResult';
import { apiClient } from '../../services/apiClient';
import { savePiles } from '../../repositories/pilesRepository';
import type { NewPilingPile } from '../../db/schema';

export class SyncPilesStep implements ISyncStep {
  readonly name = 'piles';

  async run(ctx: SyncContext): Promise<StepResult> {
    const syncedAt = Date.now();
    try {
      const { data } = await apiClient.get(`/piling/sites/${ctx.siteId}/piles`);
      const rows: NewPilingPile[] = (data as any[]).map((p) => ({
        id: p.id,
        siteId: p.site_id,
        pileIdCode: p.pile_id_code,
        areaLocation: p.area_location ?? null,
        dia: p.dia,
        depth: p.depth,
        notes: p.notes ?? null,
        syncedAt,
      }));
      await savePiles(rows);
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
