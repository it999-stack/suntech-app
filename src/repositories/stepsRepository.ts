// src/repositories/stepsRepository.ts
// CRUD for piling_steps and piling_step_duration_templates in local SQLite.

import { and, eq } from 'drizzle-orm';
import { initDb } from '@/db/client';
import {
  pilingSteps,
  pilingStepDurationTemplates,
  pilingDimensions,
} from '@/db/schema';
import type {
  PilingStep,
  PilingStepDurationTemplate,
  PilingDimension,
  NewPilingStepDurationTemplate,
  NewPilingStep,
} from '@/db/schema';

/** Returns all steps ordered by sequence_order. */
export async function getSteps(): Promise<PilingStep[]> {
  const db = await initDb();
  return db
    .select()
    .from(pilingSteps)
    .orderBy(pilingSteps.sequenceOrder);
}

/** Returns duration templates for a single step, scoped to a site (joins
 * through dimensionId -> pilingDimensions.siteId, since the template table
 * itself has no site_id column). */
export async function getTemplatesForStep(
  stepId: string,
  siteId: string,
): Promise<PilingStepDurationTemplate[]> {
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
    .where(and(eq(pilingStepDurationTemplates.stepId, stepId), eq(pilingDimensions.siteId, siteId)));
}

/**
 * Returns duration templates for a single step with the related dimension
 * joined in. Use this for display so callers have dia/depth without a
 * separate lookup.
 */
export type TemplateWithDimension = PilingStepDurationTemplate & {
  dimension: PilingDimension | null;
};

export async function getTemplatesWithDimensions(
  stepId: string,
  siteId: string,
): Promise<TemplateWithDimension[]> {
  const db = await initDb();

  const rows = await db
    .select({
      // template columns
      id: pilingStepDurationTemplates.id,
      stepId: pilingStepDurationTemplates.stepId,
      dimensionId: pilingStepDurationTemplates.dimensionId,
      durationMinutes: pilingStepDurationTemplates.durationMinutes,
      bufferBeforeMinutes: pilingStepDurationTemplates.bufferBeforeMinutes,
      syncedAt: pilingStepDurationTemplates.syncedAt,
      updatedAt: pilingStepDurationTemplates.updatedAt,
      // dimension columns
      dimId: pilingDimensions.id,
      dimSiteId: pilingDimensions.siteId,
      dia: pilingDimensions.dia,
      depth: pilingDimensions.depth,
      label: pilingDimensions.label,
      dimSyncedAt: pilingDimensions.syncedAt,
      dimUpdatedAt: pilingDimensions.updatedAt,
      dimDeletedAt: pilingDimensions.deletedAt,
    })
    .from(pilingStepDurationTemplates)
    .innerJoin(
      pilingDimensions,
      eq(pilingStepDurationTemplates.dimensionId, pilingDimensions.id),
    )
    .where(and(eq(pilingStepDurationTemplates.stepId, stepId), eq(pilingDimensions.siteId, siteId)))
    .orderBy(pilingDimensions.dia, pilingDimensions.depth);

  return rows.map((r) => ({
    id: r.id,
    stepId: r.stepId,
    dimensionId: r.dimensionId,
    durationMinutes: r.durationMinutes,
    bufferBeforeMinutes: r.bufferBeforeMinutes,
    syncedAt: r.syncedAt!,
    updatedAt: r.updatedAt,
    dimension: r.dimId
      ? {
          id: r.dimId,
          siteId: r.dimSiteId!,
          dia: r.dia!,
          depth: r.depth!,
          label: r.label ?? null,
          syncedAt: r.dimSyncedAt!,
          updatedAt: r.dimUpdatedAt,
          deletedAt: r.dimDeletedAt,
        }
      : null,
  }));
}

/**
 * Returns duration templates for every step, dimension joined in, ordered by
 * dia/depth. Used to show all steps' templates inline in one screen without a
 * per-step drill-down.
 */
export async function getAllTemplatesWithDimensions(siteId: string): Promise<TemplateWithDimension[]> {
  const db = await initDb();

  const rows = await db
    .select({
      id: pilingStepDurationTemplates.id,
      stepId: pilingStepDurationTemplates.stepId,
      dimensionId: pilingStepDurationTemplates.dimensionId,
      durationMinutes: pilingStepDurationTemplates.durationMinutes,
      bufferBeforeMinutes: pilingStepDurationTemplates.bufferBeforeMinutes,
      syncedAt: pilingStepDurationTemplates.syncedAt,
      updatedAt: pilingStepDurationTemplates.updatedAt,
      dimId: pilingDimensions.id,
      dimSiteId: pilingDimensions.siteId,
      dia: pilingDimensions.dia,
      depth: pilingDimensions.depth,
      label: pilingDimensions.label,
      dimSyncedAt: pilingDimensions.syncedAt,
      dimUpdatedAt: pilingDimensions.updatedAt,
      dimDeletedAt: pilingDimensions.deletedAt,
    })
    .from(pilingStepDurationTemplates)
    .innerJoin(
      pilingDimensions,
      eq(pilingStepDurationTemplates.dimensionId, pilingDimensions.id),
    )
    .where(eq(pilingDimensions.siteId, siteId))
    .orderBy(pilingDimensions.dia, pilingDimensions.depth);

  return rows.map((r) => ({
    id: r.id,
    stepId: r.stepId,
    dimensionId: r.dimensionId,
    durationMinutes: r.durationMinutes,
    bufferBeforeMinutes: r.bufferBeforeMinutes,
    syncedAt: r.syncedAt!,
    updatedAt: r.updatedAt,
    dimension: r.dimId
      ? {
          id: r.dimId,
          siteId: r.dimSiteId!,
          dia: r.dia!,
          depth: r.depth!,
          label: r.label ?? null,
          syncedAt: r.dimSyncedAt!,
          updatedAt: r.dimUpdatedAt,
          deletedAt: r.dimDeletedAt,
        }
      : null,
  }));
}

/** Inserts a new duration template. `id` must be provided by the caller. */
export async function insertTemplate(
  template: NewPilingStepDurationTemplate,
): Promise<void> {
  const db = await initDb();
  await db.insert(pilingStepDurationTemplates).values(template);
}

/** Saves a list of steps. */
export async function saveSteps(
  rows: NewPilingStep[],
): Promise<void> {
  const db = await initDb();

  await db.delete(pilingSteps);

  if (!rows.length) return;

  await db.insert(pilingSteps).values(rows);
}

/** Deletes a duration template by id. */
export async function deleteTemplate(id: string): Promise<void> {
  const db = await initDb();
  await db
    .delete(pilingStepDurationTemplates)
    .where(eq(pilingStepDurationTemplates.id, id));
}