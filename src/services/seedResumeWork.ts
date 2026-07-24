// Seeding service for testing the resume work feature.
// Moves today's incomplete work to yesterday to simulate resume work scenario,
// then wipes today's checklist entirely so plan generation can be tested fresh.

import { initDb } from '@db/client';
import {
  pilingChecklistPersonnel,
  pilingChecklistPiles,
  pilingDailyChecklists,
} from '@db/schema';

import { eq } from 'drizzle-orm';
import {
  getChecklistByDate,
  getChecklistPiles,
  insertChecklist,
  insertChecklistPiles,
} from '@repositories/checklistRepository';
import type { PilingDailyChecklist } from '@db/schema';
import {
  getPlanStepsForChecklist,
  getActualStepsForChecklist,
  insertPlanSteps,
  upsertActualStep,
  deletePlanStepsForChecklist,
  deleteActualStepsForChecklist,
} from '@repositories/planRepository';
import { generateId } from '@utils/helpers';

/** Helper to format date as YYYY-MM-DD */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Helper to add days to a date string */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

/**
 * Seed yesterday's date with today's incomplete work, then delete today's
 * checklist entirely. This simulates a scenario where work from yesterday
 * needs to be resumed today, while leaving today free for a fresh plan-
 * generation test.
 *
 * @param siteId - The current site ID
 * @param today - Today's date in YYYY-MM-DD format (defaults to current date)
 * @returns Object with counts of seeded items
 */
export async function seedYesterdayFromToday(
  siteId: string,
  today: string = formatDate(new Date()),
): Promise<{
  yesterdayChecklistCreated: boolean;
  planStepsCopied: number;
  actualStepsCopied: number;
  todayChecklistDeleted: boolean;
}> {
  const db = await initDb();
  const yesterday = addDays(today, -1);
  const now = Date.now();

  // Get today's checklist
  const todayChecklist = await getChecklistByDate(siteId, today);
  if (!todayChecklist) {
    return {
      yesterdayChecklistCreated: false,
      planStepsCopied: 0,
      actualStepsCopied: 0,
      todayChecklistDeleted: false,
    };
  }

  // Get today's plan steps and actuals
  const [planSteps, actualSteps, checklistPilesList] = await Promise.all([
    getPlanStepsForChecklist(todayChecklist.id),
    getActualStepsForChecklist(todayChecklist.id),
    getChecklistPiles(todayChecklist.id),
  ]);

  // Check if yesterday's checklist already exists
  const existingYesterday = await getChecklistByDate(siteId, yesterday);
  if (existingYesterday) {
    // Already seeded - don't overwrite
    return {
      yesterdayChecklistCreated: false,
      planStepsCopied: 0,
      actualStepsCopied: 0,
      todayChecklistDeleted: false,
    };
  }

  // ── 1. Create yesterday's checklist ────────────────────────────────────
  const yesterdayChecklistId = generateId();
  const yesterdayChecklist: PilingDailyChecklist = {
    id: yesterdayChecklistId,
    siteId,
    date: yesterday,
    shiftTypeId: todayChecklist.shiftTypeId,
    planStartTime: todayChecklist.planStartTime,
    planEndTime: todayChecklist.planEndTime,
    supervisorId: todayChecklist.supervisorId,
    supervisorId2: todayChecklist.supervisorId2,
    notes: todayChecklist.notes,
    status: 'IN_PROGRESS', // Mark as in progress since work was ongoing
    createdAt: now,
    updatedAt: now,
  };

  await insertChecklist(yesterdayChecklist);

  // ── 2. Copy personnel assignments ──────────────────────────────────────
  const personnelRows = await db
    .select()
    .from(pilingChecklistPersonnel)
    .where(eq(pilingChecklistPersonnel.checklistId, todayChecklist.id))
    .all();

  if (personnelRows.length > 0) {
    await db.insert(pilingChecklistPersonnel).values(
      personnelRows.map((p: { id: string; personnelId: string }) => ({
        id: generateId(),
        checklistId: yesterdayChecklistId,
        personnelId: p.personnelId,
      }))
    );
  }

  // ── 3. Copy checklist-pile entries, keeping an old→new id map ─────────
  const yesterdayCpEntries = checklistPilesList.map(
    (cp: { pileId: string; rigId: string; craneId: string }, idx: number) => ({
      id: generateId(),
      checklistId: yesterdayChecklistId,
      pileId: cp.pileId,
      seqNo: idx + 1,
      rigId: cp.rigId,
      craneId: cp.craneId,
      status: 'IN_PROGRESS' as const,
      createdAt: now,
    }),
  );

  await insertChecklistPiles(yesterdayCpEntries);

  const oldToNewCpId = new Map<string, string>();
  checklistPilesList.forEach((cp, idx) => {
    oldToNewCpId.set(cp.id, yesterdayCpEntries[idx].id);
  });

  // ── 4. Copy ALL plan steps to yesterday (done and not-done alike) ─────
  const yesterdayPlanSteps = planSteps.map((ps) => ({
    id: generateId(),
    checklistPileId: oldToNewCpId.get(ps.checklistPileId)!,
    stepId: ps.stepId,
    plannedStart: ps.plannedStart,
    plannedEnd: ps.plannedEnd,
    durationMinutes: ps.durationMinutes ?? null,
    bufferMinutes: ps.bufferMinutes ?? null,
    assignedMachineId: ps.assignedMachineId ?? null,
    createdAt: now,
  }));
  if (yesterdayPlanSteps.length > 0) {
    await insertPlanSteps(yesterdayPlanSteps);
  }

  // ── 5. Copy ALL actual steps to yesterday — completed and in-progress ──
  // In-progress steps (actualStart set, actualEnd still null) must carry
  // over too, or findResumeWorkForPiles() sees no actual-step row and treats
  // the pile as "not yet started," skipping the resume remaining-time
  // confirm flow entirely.
  let actualStepsCopied = 0;
  for (const as of actualSteps) {
    const newCpId = oldToNewCpId.get(as.checklistPileId);
    if (!newCpId) continue;
    await upsertActualStep({
      id: generateId(),
      checklistPileId: newCpId,
      stepId: as.stepId,
      actualStart: as.actualStart,
      actualEnd: as.actualEnd,
      remarks: as.remarks,
    });
    actualStepsCopied++;
  }

  // ── 6. Delete today's checklist entirely — clean slate for testing ────
  // Order matters: children before parent.
  await deleteActualStepsForChecklist(todayChecklist.id);
  await deletePlanStepsForChecklist(todayChecklist.id);
  await db
    .delete(pilingChecklistPersonnel)
    .where(eq(pilingChecklistPersonnel.checklistId, todayChecklist.id));
  await db
    .delete(pilingChecklistPiles)
    .where(eq(pilingChecklistPiles.checklistId, todayChecklist.id));
  await db
    .delete(pilingDailyChecklists)
    .where(eq(pilingDailyChecklists.id, todayChecklist.id));

  return {
    yesterdayChecklistCreated: true,
    planStepsCopied: yesterdayPlanSteps.length,
    actualStepsCopied,
    todayChecklistDeleted: true,
  };
}