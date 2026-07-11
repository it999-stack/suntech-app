// src/sync/steps/syncDimensions.ts
// Syncs piling_dimensions from server into local SQLite.

import type { ISyncStep } from '@sync/bootstrap/ISyncStep';
import type { SyncContext } from '@sync/bootstrap/syncContext';
import type { StepResult } from '@sync/bootstrap/syncResult';
import { apiClient } from '@services/apiClient';
import { saveDimensions } from '@repositories/dimensionsRepository';
import type { NewPilingDimension } from '@db/schema';

export class SyncDimensionsStep implements ISyncStep {
  readonly name = 'dimensions';

  async run(ctx: SyncContext): Promise<StepResult> {
    const syncedAt = Date.now();
    try {
      const { data } = await apiClient.get(`/piling/sites/${ctx.siteId}/dimensions`);
      const rows: NewPilingDimension[] = (data as any[]).map((d) => ({
        id: d.id,
        siteId: d.site_id,
        dia: d.dia,
        depth: d.depth,
        label: d.label ?? null,
        syncedAt,
      }));
      await saveDimensions(rows);
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
