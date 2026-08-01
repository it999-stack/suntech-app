// src/repositories/durationTemplatesRepository.ts
// Local SQLite access for piling_step_duration_templates.

import { initDb } from '@db/client';
import {
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
 * Returns all duration templates (used by planner).
 */
export async function getAllDurationTemplates(): Promise<PilingStepDurationTemplate[]> {
  const db = await initDb();
  return db.select().from(pilingStepDurationTemplates).all();
}