// src/repositories/durationTemplatesRepository.ts
// Local SQLite access for piling_step_duration_templates.

import { eq, inArray } from 'drizzle-orm';
import { initDb } from '@db/client';
import {
  pilingDimensions,
  pilingStepDurationTemplates,
  type NewPilingStepDurationTemplate,
  type PilingStepDurationTemplate,
} from '@db/schema';

/**
 * Upsert duration templates by id. Was previously a delete-all-then-insert
 * — harmless for bootstrap (table starts empty) but would silently wipe
 * every template not included in a given delta-sync batch, so this must be
 * upsert-by-id to be safe for both callers.
 */
export async function saveDurationTemplates(
  rows: NewPilingStepDurationTemplate[],
): Promise<void> {
  if (!rows.length) return;

  const db = await initDb();
  for (const template of rows) {
    await db
      .insert(pilingStepDurationTemplates)
      .values(template)
      .onConflictDoUpdate({
        target: pilingStepDurationTemplates.id,
        set: {
          stepId: template.stepId,
          dimensionId: template.dimensionId,
          durationMinutes: template.durationMinutes,
          bufferBeforeMinutes: template.bufferBeforeMinutes,
          syncedAt: template.syncedAt,
          updatedAt: template.updatedAt,
        },
      });
  }
}

/**
 * Returns all duration templates for a single site (joins through
 * dimensionId -> pilingDimensions.siteId, since the template table itself
 * has no site_id column).
 */
export async function getAllDurationTemplates(siteId: string): Promise<PilingStepDurationTemplate[]> {
  const db = await initDb();
  return db
    .select({
      id: pilingStepDurationTemplates.id,
      stepId: pilingStepDurationTemplates.stepId,
      dimensionId: pilingStepDurationTemplates.dimensionId,
      durationMinutes: pilingStepDurationTemplates.durationMinutes,
      bufferBeforeMinutes: pilingStepDurationTemplates.bufferBeforeMinutes,
      syncedAt: pilingStepDurationTemplates.syncedAt,
      updatedAt: pilingStepDurationTemplates.updatedAt,
    })
    .from(pilingStepDurationTemplates)
    .innerJoin(pilingDimensions, eq(pilingStepDurationTemplates.dimensionId, pilingDimensions.id))
    .where(eq(pilingDimensions.siteId, siteId))
    .all();
}

/**
 * Deletes every local duration-template row belonging to the given site
 * (via dimensionId -> pilingDimensions.siteId). Only safe to call from a
 * bootstrap sync that immediately re-inserts the site's full current set —
 * see the caller in syncSteps.ts.
 */
export async function deleteDurationTemplatesForSite(siteId: string): Promise<void> {
  const db = await initDb();

  const dims = await db
    .select({ id: pilingDimensions.id })
    .from(pilingDimensions)
    .where(eq(pilingDimensions.siteId, siteId))
    .all();

  const dimensionIds = dims.map((d) => d.id);
  if (!dimensionIds.length) return;

  await db
    .delete(pilingStepDurationTemplates)
    .where(inArray(pilingStepDurationTemplates.dimensionId, dimensionIds));
}