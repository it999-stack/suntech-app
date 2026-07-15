// src/db/schema.ts
// Local SQLite schema for offline-first data cache.

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/** A named work zone within a piling site, such as "Zone A" or "Tower 1". */
export const pilingAreas = sqliteTable('piling_areas', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  name: text('name').notNull(),
  code: text('code'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type PilingArea = typeof pilingAreas.$inferSelect;
export type NewPilingArea = typeof pilingAreas.$inferInsert;

/**
 * The unfinished work item for a physical pile. This is deliberately separate
 * from daily checklist records so a step can resume on a later plan.
 */
export const pileWorkProgress = sqliteTable('pile_work_progress', {
  id: text('id').primaryKey(),
  pileId: text('pile_id').notNull().unique(),
  stepId: text('step_id').notNull(),
  remainingMinutes: integer('remaining_minutes').notNull(),
  status: text('status').notNull().default('PENDING_RESUME'),
  lastChecklistPileId: text('last_checklist_pile_id'),
  lastRigId: text('last_rig_id'),
  lastCraneId: text('last_crane_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type PileWorkProgress = typeof pileWorkProgress.$inferSelect;
export type NewPileWorkProgress = typeof pileWorkProgress.$inferInsert;

// ─── Piling Piles (synced from server) ───────────────────────────────────────

/**
 * Local cache of piling_piles fetched from the server for the user's site.
 * Rows are replaced wholesale on each sync (upsert by id).
 * synced_at: Unix timestamp (ms) of the sync that wrote this row.
 */
export const pilingPiles = sqliteTable('piling_piles', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  areaId: text('area_id'),
  pileIdCode: text('pile_id_code').notNull(),
  areaLocation: text('area_location'),
  dimensionId: text('dimension_id').notNull(),
  notes: text('notes'),
  syncedAt: integer('synced_at').notNull(),
});

export type PilingPile = typeof pilingPiles.$inferSelect;
export type NewPilingPile = typeof pilingPiles.$inferInsert;

// ─── Piling Dimensions (synced from server) ─────────────────────────────────

/**
 * Local cache of piling_dimensions fetched from the server for the user's site.
 * Used to populate Dia/Depth templates in site settings.
 */
export const pilingDimensions = sqliteTable('piling_dimensions', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  dia: integer('dia').notNull(),
  depth: integer('depth').notNull(),
  label: text('label'),
  syncedAt: integer('synced_at').notNull(),
});

export type PilingDimension = typeof pilingDimensions.$inferSelect;
export type NewPilingDimension = typeof pilingDimensions.$inferInsert;

// ─── Piling Shift Types (synced from server) ─────────────────────────────────

/**
 * Local cache of piling_shift_types fetched from the server.
 * Local cache of piling_shift_types fetched from the server for the currently assigned site.
 */
export const pilingShiftTypes = sqliteTable('piling_shift_types', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  name: text('name').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  syncedAt: integer('synced_at').notNull(),
});

export type PilingShiftType = typeof pilingShiftTypes.$inferSelect;
export type NewPilingShiftType = typeof pilingShiftTypes.$inferInsert;

// ─── Piling Non-Working Windows (synced from server) ─────────────────────────

/** How the planner should treat a non-working window during scheduling. */
export type NonWorkingWindowBehavior =
  | 'FIXED'
  | 'AFTER_CURRENT_STEP';

/**
 * Local cache of piling_non_working_windows fetched from the server.
 * Scoped to a site + shift type.
 */
export const pilingNonWorkingWindows = sqliteTable('piling_non_working_windows', {
  id: text('id').primaryKey(),
  shiftTypeId: text('shift_type_id').notNull(),
  label: text('label').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  behavior: text('behavior').notNull().default('FIXED'),
  syncedAt: integer('synced_at').notNull(),
});

export type PilingNonWorkingWindow = typeof pilingNonWorkingWindows.$inferSelect;
export type NewPilingNonWorkingWindow = typeof pilingNonWorkingWindows.$inferInsert;

// ─── Piling Machines (synced from server) ────────────────────────────────────

/**
 * Local cache of piling_machines fetched from the server for the user's site.
 * Rows are replaced wholesale on each sync (upsert by id).
 */
export const pilingMachines = sqliteTable('piling_machines', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  machineNo: text('machine_no').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull(),
  syncedAt: integer('synced_at').notNull(),
});

export type PilingMachine = typeof pilingMachines.$inferSelect;
export type NewPilingMachine = typeof pilingMachines.$inferInsert;

// ─── Piling Personnel (synced from server) ───────────────────────────────────

/**
 * Local cache of piling_site_personnel fetched from the server for the user's site.
 */
export const pilingPersonnel = sqliteTable('piling_personnel', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  name: text('name').notNull(),
  designation: text('designation').notNull(),
  phone: text('phone'),
  email: text('email'),
  employeeCode: text('employee_code'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  syncedAt: integer('synced_at').notNull(),
});

export type PilingPersonnel = typeof pilingPersonnel.$inferSelect;
export type NewPilingPersonnel = typeof pilingPersonnel.$inferInsert;

// ─── Piling Steps (seeded locally on first init) ──────────────────────────────

/**
 * Default workflow steps for piling operations.
 * These are seeded once on initDb() and never synced from server.
 */
export const pilingSteps = sqliteTable('piling_steps', {
  id: text('id').primaryKey(),
  stepName: text('step_name').notNull().unique(),
  sequenceOrder: integer('sequence_order').notNull(),
  track: text('track').notNull(),
});

export type PilingStep = typeof pilingSteps.$inferSelect;
export type NewPilingStep = typeof pilingSteps.$inferInsert;

// ─── Piling Step Duration Templates (synced from server) ──────────────────────

/**
 * Duration templates per step × dimension, synced from server.
 * dimensionId → pilingDimensions.id (carries the dia/depth; no redundant columns).
 * e.g. Boring at dimension_id=<600/18mm row> → 90 min.
 */
export const pilingStepDurationTemplates = sqliteTable('piling_step_duration_templates', {
  id: text('id').primaryKey(),
  stepId: text('step_id').notNull(),
  dimensionId: text('dimension_id').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  bufferBeforeMinutes: integer('buffer_before_minutes').notNull().default(0),
  syncedAt: integer('synced_at').notNull(),
});

export type PilingStepDurationTemplate = typeof pilingStepDurationTemplates.$inferSelect;
export type NewPilingStepDurationTemplate = typeof pilingStepDurationTemplates.$inferInsert;

// ─── Daily Checklists (one per site per calendar day, created locally) ────────

/**
 * Represents one day's working session at a site.
 * date: ISO date string "YYYY-MM-DD"
 * planStartTime: ISO timestamp string for when the 24hr plan begins
 * planEndTime: ISO timestamp string for when the 24hr plan ends (typically planStartTime + 24h)
 * shiftTypeId: the active shift for this day (→ pilingShiftTypes.id)
 * status: 'DRAFT' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED'
 */
export const pilingDailyChecklists = sqliteTable('piling_daily_checklists', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  date: text('date').notNull(),
  shiftTypeId: text('shift_type_id'),
  planStartTime: text('plan_start_time'),
  planEndTime: text('plan_end_time'),
  supervisorId: text('supervisor_id'),
  supervisorId2: text('supervisor_id_2'),
  notes: text('notes'),
  status: text('status').notNull().default('DRAFT'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type PilingDailyChecklist = typeof pilingDailyChecklists.$inferSelect;
export type NewPilingDailyChecklist = typeof pilingDailyChecklists.$inferInsert;

// ─── Checklist Personnel (who was on duty this day) ───────────────────────────

/**
 * Junction: which personnel were on duty for a given checklist day.
 */
export const pilingChecklistPersonnel = sqliteTable('piling_checklist_personnel', {
  id: text('id').primaryKey(),
  checklistId: text('checklist_id').notNull(),
  personnelId: text('personnel_id').notNull(),
});

export type PilingChecklistPersonnel = typeof pilingChecklistPersonnel.$inferSelect;
export type NewPilingChecklistPersonnel = typeof pilingChecklistPersonnel.$inferInsert;

// ─── Checklist Piles (piles scheduled for a day) ─────────────────────────────

/**
 * Junction: which piles are being worked on a given checklist day.
 * seqNo: order in which the rig will work through the piles.
 * rigId, craneId: which machines are assigned to this pile on this day.
 * status: lifecycle of this pile on this day.
 */
export const pilingChecklistPiles = sqliteTable('piling_checklist_piles', {
  id: text('id').primaryKey(),
  checklistId: text('checklist_id').notNull(),
  pileId: text('pile_id').notNull(),
  seqNo: integer('seq_no').notNull(),
  rigId: text('rig_id').notNull(),
  craneId: text('crane_id').notNull(),
  status: text('status').notNull().default('NOT_STARTED'),
  createdAt: integer('created_at').notNull(),
});

export type PilingChecklistPile = typeof pilingChecklistPiles.$inferSelect;
export type NewPilingChecklistPile = typeof pilingChecklistPiles.$inferInsert;

// ─── Plan Steps (planned timeline per pile per day) ───────────────────────────

/**
 * Generated by the local planner — one row per pile×step with planned start/end.
 * plannedStart / plannedEnd are ISO timestamp strings.
 * These are regenerated wholesale each time "Generate Plan" is run.
 */
export const pilePlanSteps = sqliteTable('pile_plan_steps', {
  id: text('id').primaryKey(),
  checklistPileId: text('checklist_pile_id').notNull(),
  stepId: text('step_id').notNull(),
  plannedStart: text('planned_start').notNull(),
  plannedEnd: text('planned_end').notNull(),
  durationMinutes: integer('duration_minutes'),
  bufferMinutes: integer('buffer_minutes'),
  assignedMachineId: text('assigned_machine_id'),
  createdAt: integer('created_at').notNull(),
});

export type PilePlanStep = typeof pilePlanSteps.$inferSelect;
export type NewPilePlanStep = typeof pilePlanSteps.$inferInsert;

// ─── Actual Steps (recorded actuals per pile per day) ────────────────────────

/**
 * User-recorded actual start/end times per pile×step.
 * actualStart / actualEnd are ISO timestamp strings (nullable until filled).
 */
export const pileActualSteps = sqliteTable('pile_actual_steps', {
  id: text('id').primaryKey(),
  checklistPileId: text('checklist_pile_id').notNull(),
  stepId: text('step_id').notNull(),
  actualStart: text('actual_start'),
  actualEnd: text('actual_end'),
  remarks: text('remarks'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type PileActualStep = typeof pileActualSteps.$inferSelect;
export type NewPileActualStep = typeof pileActualSteps.$inferInsert;