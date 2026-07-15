// src/repositories/durationTemplatesRepository.ts
// Local SQLite access for piling_step_duration_templates.

import { initDb } from '@db/client';
import {
  pilingStepDurationTemplates,
  type NewPilingStepDurationTemplate,
  type PilingStepDurationTemplate,
} from '@db/schema';

/**
 * Replaces all cached duration templates with the latest server copy.
 * This table is now server-synced, not user-edited.
 */
export async function saveDurationTemplates(
  rows: NewPilingStepDurationTemplate[],
): Promise<void> {
  const db = await initDb();
  await db.delete(pilingStepDurationTemplates);

  if (!rows.length) return;

  await db.insert(pilingStepDurationTemplates).values(rows);
}

/**
 * Returns all duration templates for a site.
 */
export async function getDurationTemplatesBySite(
  siteId: string,
): Promise<PilingStepDurationTemplate[]> {
  const db = await initDb();
  return db.select().from(pilingStepDurationTemplates).all();
}

/**
 * Returns all duration templates (used by planner).
 */
export async function getAllDurationTemplates(): Promise<PilingStepDurationTemplate[]> {
  const db = await initDb();
  return db.select().from(pilingStepDurationTemplates).all();
}