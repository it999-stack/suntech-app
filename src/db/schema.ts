// src/db/schema.ts
// Local SQLite schema for offline-first data cache.

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// ─── Piling Piles (synced from server) ───────────────────────────────────────

/**
 * Local cache of piling_piles fetched from the server for the user's site.
 * Rows are replaced wholesale on each sync (upsert by id).
 * synced_at: Unix timestamp (ms) of the sync that wrote this row.
 */
export const pilingPiles = sqliteTable('piling_piles', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  pileIdCode: text('pile_id_code').notNull(),
  areaLocation: text('area_location'),
  dia: integer('dia').notNull(),
  depth: integer('depth').notNull(),
  notes: text('notes'),
  syncedAt: integer('synced_at').notNull(), // unix ms — when this row was last synced
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
 * Global reference data (not site-scoped on the server, but we scope by usage).
 */
export const pilingShiftTypes = sqliteTable('piling_shift_types', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  startTime: text('start_time').notNull(), // "HH:MM" e.g. "07:00"
  endTime: text('end_time').notNull(),     // "HH:MM" e.g. "19:00"
  syncedAt: integer('synced_at').notNull(),
});

export type PilingShiftType = typeof pilingShiftTypes.$inferSelect;
export type NewPilingShiftType = typeof pilingShiftTypes.$inferInsert;

// ─── Piling Non-Working Windows (synced from server) ─────────────────────────

/** How the planner should treat a non-working window during scheduling. */
export type NonWorkingWindowBehavior =
  | 'FIXED'               // break stays at its scheduled time; steps are split around it
  | 'AFTER_CURRENT_STEP'; // if a step is in progress when the break starts, the step runs
                          // through and the break is deferred to start right after the step ends

/**
 * Local cache of piling_non_working_windows fetched from the server.
 * Scoped to a site + shift type.
 */
export const pilingNonWorkingWindows = sqliteTable('piling_non_working_windows', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  shiftTypeId: text('shift_type_id').notNull(),
  label: text('label').notNull(),
  startTime: text('start_time').notNull(), // "HH:MM"
  endTime: text('end_time').notNull(),     // "HH:MM"
  behavior: text('behavior').notNull().default('FIXED'), // NonWorkingWindowBehavior
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
  type: text('type').notNull(),         // "RIG" | "CRANE"
  status: text('status').notNull(),     // "ACTIVE" | "INACTIVE"
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
 * Users can see/manage duration templates per step from Site Settings.
 */
export const pilingSteps = sqliteTable('piling_steps', {
  id: text('id').primaryKey(),                       // deterministic short id e.g. 'step_casing'
  stepName: text('step_name').notNull().unique(),    // e.g. 'Casing'
  sequenceOrder: integer('sequence_order').notNull(),
  track: text('track').notNull(),                    // 'RIG' | 'CRANE'
});

export type PilingStep = typeof pilingSteps.$inferSelect;
export type NewPilingStep = typeof pilingSteps.$inferInsert;

// ─── Piling Step Duration Templates (user-configured) ─────────────────────────

/**
 * User-configured duration templates per step × dimension.
 * dimensionId → pilingDimensions.id (carries the dia/depth; no redundant columns).
 * e.g. Boring at dimension_id=<600/18m row> → 90 min.
 * Written locally, never synced to server (yet).
 */
export const pilingStepDurationTemplates = sqliteTable('piling_step_duration_templates', {
  id: text('id').primaryKey(),                              // uuid generated on insert
  stepId: text('step_id').notNull(),                        // → pilingSteps.id
  dimensionId: text('dimension_id').notNull(),              // → pilingDimensions.id
  durationMinutes: integer('duration_minutes').notNull(),
  bufferBeforeMinutes: integer('buffer_before_minutes').notNull().default(0),
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
  id: text('id').primaryKey(),                    // uuid generated on create
  siteId: text('site_id').notNull(),
  date: text('date').notNull(),                   // "YYYY-MM-DD"
  shiftTypeId: text('shift_type_id'),             // optional — chosen at plan time
  planStartTime: text('plan_start_time'),         // ISO timestamp — 24hr plan anchor start
  planEndTime: text('plan_end_time'),             // ISO timestamp — 24hr plan anchor end
  supervisorId: text('supervisor_id'),            // → pilingPersonnel.id (day/shift-1 supervisor)
  supervisorId2: text('supervisor_id_2'),         // → pilingPersonnel.id (night/shift-2 supervisor)
  notes: text('notes'),
  status: text('status').notNull().default('DRAFT'), // 'DRAFT' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED'
  createdAt: integer('created_at').notNull(),     // unix ms
  updatedAt: integer('updated_at').notNull(),     // unix ms
});

export type PilingDailyChecklist = typeof pilingDailyChecklists.$inferSelect;
export type NewPilingDailyChecklist = typeof pilingDailyChecklists.$inferInsert;

// ─── Checklist Personnel (who was on duty this day) ───────────────────────────

/**
 * Junction: which personnel were on duty for a given checklist day.
 */
export const pilingChecklistPersonnel = sqliteTable('piling_checklist_personnel', {
  id: text('id').primaryKey(),
  checklistId: text('checklist_id').notNull(),   // → pilingDailyChecklists.id
  personnelId: text('personnel_id').notNull(),   // → pilingPersonnel.id
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
  id: text('id').primaryKey(),                    // uuid generated on insert
  checklistId: text('checklist_id').notNull(),    // → pilingDailyChecklists.id
  pileId: text('pile_id').notNull(),              // → pilingPiles.id
  seqNo: integer('seq_no').notNull(),             // 1-based ordering
  rigId: text('rig_id').notNull(),                // → pilingMachines.id (type=RIG)
  craneId: text('crane_id').notNull(),            // → pilingMachines.id (type=CRANE)
  status: text('status').notNull().default('NOT_STARTED'), // 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
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
  checklistPileId: text('checklist_pile_id').notNull(), // → pilingChecklistPiles.id
  stepId: text('step_id').notNull(),                    // → pilingSteps.id
  plannedStart: text('planned_start').notNull(),        // ISO timestamp
  plannedEnd: text('planned_end').notNull(),            // ISO timestamp
  /** Pure working minutes for this step — excludes break time swallowed by skipNonWorkingWindows. */
  durationMinutes: integer('duration_minutes'),         // null for rows created before this migration
  /** Buffer before minutes for this step — time reserved before the step starts (e.g. setup). */
  bufferMinutes: integer('buffer_minutes'),             // null for legacy rows; treat as 0
  /** Which machine (rig or crane) was assigned to this step by the planner. */
  assignedMachineId: text('assigned_machine_id'),       // → pilingMachines.id; null for legacy rows
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
  checklistPileId: text('checklist_pile_id').notNull(), // → pilingChecklistPiles.id
  stepId: text('step_id').notNull(),                    // → pilingSteps.id
  actualStart: text('actual_start'),                    // ISO timestamp, nullable
  actualEnd: text('actual_end'),                        // ISO timestamp, nullable
  remarks: text('remarks'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type PileActualStep = typeof pileActualSteps.$inferSelect;
export type NewPileActualStep = typeof pileActualSteps.$inferInsert;
