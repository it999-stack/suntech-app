// src/db/schema.ts
// Local SQLite schema for offline-first data cache.

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/** A named work zone within a piling site, such as "Zone A" or "Tower 1". */
export const pilingLocations = sqliteTable('pil_locations', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  name: text('name').notNull(),
  code: text('code'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  // Phase 3: mirrors the server's deleted_at, added for full reference-table
  // symmetry even though no delete endpoint exists for locations yet.
  deletedAt: integer('deleted_at'),
});

export type PilingLocation = typeof pilingLocations.$inferSelect;
export type NewPilingLocation = typeof pilingLocations.$inferInsert;

/**
 * The unfinished work item for a physical pile. This is deliberately separate
 * from daily checklist records so a step can resume on a later plan.
 */
export const pileWorkProgress = sqliteTable('pil_work_progress', {
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
export const pilingPiles = sqliteTable('pil_piles', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  locationId: text('location_id'),
  pileIdCode: text('pile_id_code').notNull(),
  area: text('area'),
  dimensionId: text('dimension_id').notNull(),
  notes: text('notes'),
  syncedAt: integer('synced_at').notNull(),
  // Phase 2 groundwork for a future delta-sync cursor — not read/written yet.
  updatedAt: integer('updated_at'),
  deletedAt: integer('deleted_at'),
});

export type PilingPile = typeof pilingPiles.$inferSelect;
export type NewPilingPile = typeof pilingPiles.$inferInsert;

// ─── Piling Dimensions (synced from server) ─────────────────────────────────

/**
 * Local cache of piling_dimensions fetched from the server for the user's site.
 * Used to populate Dia/Depth templates in site settings.
 */
export const pilingDimensions = sqliteTable('pil_dimensions', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  dia: integer('dia').notNull(),
  depth: integer('depth').notNull(),
  label: text('label'),
  syncedAt: integer('synced_at').notNull(),
  // Phase 2 groundwork for a future delta-sync cursor — not read/written yet.
  updatedAt: integer('updated_at'),
  deletedAt: integer('deleted_at'),
});

export type PilingDimension = typeof pilingDimensions.$inferSelect;
export type NewPilingDimension = typeof pilingDimensions.$inferInsert;

// ─── Piling Shift Types (synced from server) ─────────────────────────────────

/**
 * Local cache of piling_shift_types fetched from the server.
 * Local cache of piling_shift_types fetched from the server for the currently assigned site.
 */
export const pilingShiftTypes = sqliteTable('pil_shift_types', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  name: text('name').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  syncedAt: integer('synced_at').notNull(),
  // Phase 2 groundwork for a future delta-sync cursor — not read/written yet.
  updatedAt: integer('updated_at'),
  deletedAt: integer('deleted_at'),
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
export const pilingNonWorkingWindows = sqliteTable('pil_non_working_windows', {
  id: text('id').primaryKey(),
  shiftTypeId: text('shift_type_id').notNull(),
  label: text('label').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  behavior: text('behavior').notNull().default('FIXED'),
  syncedAt: integer('synced_at').notNull(),
  // Phase 2 groundwork for a future delta-sync cursor — not read/written yet.
  updatedAt: integer('updated_at'),
  deletedAt: integer('deleted_at'),
});

export type PilingNonWorkingWindow = typeof pilingNonWorkingWindows.$inferSelect;
export type NewPilingNonWorkingWindow = typeof pilingNonWorkingWindows.$inferInsert;

// ─── Piling Machines (synced from server) ────────────────────────────────────

/**
 * Local cache of piling_machines fetched from the server for the user's site.
 * Rows are replaced wholesale on each sync (upsert by id).
 */
export const pilingMachines = sqliteTable('pil_machines', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  machineNo: text('machine_no').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull(),
  syncedAt: integer('synced_at').notNull(),
  // Phase 2 groundwork for a future delta-sync cursor — not read/written yet.
  updatedAt: integer('updated_at'),
  deletedAt: integer('deleted_at'),
});

export type PilingMachine = typeof pilingMachines.$inferSelect;
export type NewPilingMachine = typeof pilingMachines.$inferInsert;

// ─── Piling Contractors (synced from server) ─────────────────────────────────

/**
 * Local cache of the site-scoped contractor master list fetched from the
 * server — backs the "Name of Pile Contractor" / "Name of Cage Contractor"
 * dropdown fields on the one-time pile measurements (see pilPileMeasurements
 * below). Same sync shape/pattern as pilingMachines: upsert on id, wholesale
 * replace via deleted_ids.
 */
export const pilContractors = sqliteTable('pil_contractors', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  name: text('name').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  syncedAt: integer('synced_at').notNull(),
  // Phase 2 groundwork for a future delta-sync cursor — not read/written yet.
  updatedAt: integer('updated_at'),
  deletedAt: integer('deleted_at'),
});

export type PilContractor = typeof pilContractors.$inferSelect;
export type NewPilContractor = typeof pilContractors.$inferInsert;

// ─── Piling Site Personnel (synced from server) ──────────────────────────────

/**
 * Local cache of piling_site_personnel fetched from the server for the user's site.
 */
export const pilingSitePersonnel = sqliteTable('pil_site_personnel', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  name: text('name').notNull(),
  designation: text('designation').notNull(),
  phone: text('phone'),
  email: text('email'),
  employeeCode: text('employee_code'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  syncedAt: integer('synced_at').notNull(),
  // Phase 2 groundwork for a future delta-sync cursor — not read/written yet.
  updatedAt: integer('updated_at'),
  deletedAt: integer('deleted_at'),
});

export type PilingSitePersonnel = typeof pilingSitePersonnel.$inferSelect;
export type NewPilingSitePersonnel = typeof pilingSitePersonnel.$inferInsert;

// ─── Site Coordinators (synced from server) ───────────────────────────────────

/**
 * Local cache of site_coordinator-role users fetched from the server for the
 * user's site — the "who do I call" list behind Generate Plan's "Connect Head
 * Office" action. `id` is the backend person.id.
 */
export const pilSiteCoordinators = sqliteTable('pil_site_coordinators', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  syncedAt: integer('synced_at').notNull(),
});

export type PilSiteCoordinator = typeof pilSiteCoordinators.$inferSelect;
export type NewPilSiteCoordinator = typeof pilSiteCoordinators.$inferInsert;

// ─── Piling Steps (synced from server) ──────────────────────────────────────

/**
 * This device's site's own chosen/ordered workflow steps (server-side:
 * pil_site_steps joined to the shared pil_steps name/track catalog), synced
 * from server on every bootstrap (see sync/steps/syncSteps.ts) — this table
 * is fully replaced (delete-all, then insert) on each sync, not merged. `id`
 * is the catalog step id (matches server-side pil_steps.id / what plan and
 * actual step rows FK to), not the per-site pil_site_steps row id — this
 * device only ever holds one site's steps at a time, so sequenceOrder stays
 * trivially unique locally even though it's now site-scoped server-side.
 */
export const pilingSteps = sqliteTable('pil_steps', {
  id: text('id').primaryKey(),
  stepName: text('step_name').notNull(),
  sequenceOrder: integer('sequence_order').notNull().unique(),
  track: text('track').notNull(),
  isSplittable: integer('is_splittable', { mode: 'boolean' }).notNull().default(true),
  // Phase 2 groundwork for a future delta-sync cursor — not read/written yet.
  updatedAt: integer('updated_at'),
});

export type PilingStep = typeof pilingSteps.$inferSelect;
export type NewPilingStep = typeof pilingSteps.$inferInsert;

// ─── Piling Step Duration Templates (synced from server) ──────────────────────

/**
 * Duration templates per step × dimension, synced from server.
 * dimensionId → pilingDimensions.id (carries the dia/depth; no redundant columns).
 * e.g. Boring at dimension_id=<600/18mm row> → 90 min.
 */
export const pilingStepDurationTemplates = sqliteTable('pil_step_duration_templates', {
  id: text('id').primaryKey(),
  stepId: text('step_id').notNull(),
  dimensionId: text('dimension_id').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  bufferBeforeMinutes: integer('buffer_before_minutes').notNull().default(0),
  syncedAt: integer('synced_at').notNull(),
  // Phase 2 groundwork for a future delta-sync cursor — not read/written yet.
  updatedAt: integer('updated_at'),
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
export const pilingDailyChecklists = sqliteTable('pil_daily_checklists', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  date: text('date').notNull(),
  shiftTypeId: text('shift_type_id'),
  planStartTime: text('plan_start_time'),
  planEndTime: text('plan_end_time'),
  notes: text('notes'),
  status: text('status').notNull().default('DRAFT'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  // Phase 2 groundwork for a future delta-sync cursor — not read/written yet.
  deletedAt: integer('deleted_at'),
});

export type PilingDailyChecklist = typeof pilingDailyChecklists.$inferSelect;
export type NewPilingDailyChecklist = typeof pilingDailyChecklists.$inferInsert;

// ─── Checklist Personnel (role assignments for this checklist day) ────────────

/**
 * Junction: which personnel hold which role on a given checklist day.
 * role: 'PROJECT_MANAGER' | 'PLANNING_ENGINEER' | 'SHIFT_INCHARGE' | 'ENGINEER' | 'SUPERVISOR' | 'MACHINE_OPERATOR'
 * machineId: set for ENGINEER/SUPERVISOR/MACHINE_OPERATOR rows (→ pilingMachines.id), null otherwise.
 * shiftSlot: set for SHIFT_INCHARGE/ENGINEER/SUPERVISOR/MACHINE_OPERATOR rows (1 or 2 — every
 * role except PROJECT_MANAGER/PLANNING_ENGINEER is assigned per shift), null otherwise.
 * A person can have multiple rows on one checklist (e.g. an ENGINEER row per
 * machine in their group, or a SUPERVISOR row per rig they cover) —
 * uniqueness is enforced per-shape by the three partial indexes in
 * db/client.ts, not a single (checklist_id, personnel_id) pair.
 */
export const pilingChecklistPersonnel = sqliteTable('pil_checklist_personnel', {
  id: text('id').primaryKey(),
  checklistId: text('checklist_id').notNull(),
  personnelId: text('personnel_id').notNull(),
  role: text('role'),
  machineId: text('machine_id'),
  shiftSlot: integer('shift_slot'),
  // Phase 2 groundwork for a future delta-sync cursor — not read/written yet.
  updatedAt: integer('updated_at'),
});

export type PilingChecklistPersonnel = typeof pilingChecklistPersonnel.$inferSelect;
export type NewPilingChecklistPersonnel = typeof pilingChecklistPersonnel.$inferInsert;

// ─── Site Role Defaults (site-scoped "last used" personnel per role) ─────────

/**
 * Local cache of pil_role_defaults, synced from GET /piling/sites/:id/role-defaults.
 * Server is the sole writer of this data — the app never computes it locally,
 * only reads it once at draft-init time to pre-fill a new plan's role pickers.
 * Rows are replaced wholesale on each sync, same as pilingMachines/pilingSitePersonnel.
 */
export const pilingSiteRoleDefaults = sqliteTable('pil_role_defaults', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull(),
  role: text('role').notNull(),
  machineId: text('machine_id'),
  shiftSlot: integer('shift_slot'),
  personnelId: text('personnel_id').notNull(),
  syncedAt: integer('synced_at').notNull(),
  updatedAt: integer('updated_at'),
});

export type PilingSiteRoleDefault = typeof pilingSiteRoleDefaults.$inferSelect;
export type NewPilingSiteRoleDefault = typeof pilingSiteRoleDefaults.$inferInsert;

// ─── Checklist Piles (piles scheduled for a day) ─────────────────────────────

/**
 * Junction: which piles are being worked on a given checklist day.
 * seqNo: order in which the rig will work through the piles.
 * rigId, craneId: which machines are assigned to this pile on this day.
 * status: lifecycle of this pile on this day.
 */
export const pilingChecklistPiles = sqliteTable('pil_checklist_piles', {
  id: text('id').primaryKey(),
  checklistId: text('checklist_id').notNull(),
  pileId: text('pile_id').notNull(),
  seqNo: integer('seq_no').notNull(),
  rigId: text('rig_id').notNull(),
  // Optional — a pile can be planned with a rig alone (a rig can perform any
  // CRANE-track step, never the reverse). Mirrors core/models/piling.py's
  // PilingChecklistPile.crane_id.
  craneId: text('crane_id'),
  status: text('status')
    .notNull()
    .default('NOT_STARTED')
    .$type<'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'>(),
  createdAt: integer('created_at').notNull(),
  // Phase 2 groundwork for a future delta-sync cursor — not read/written yet.
  updatedAt: integer('updated_at'),
  // The server's own `updated_at`, echoed back verbatim from the last pull/
  // hydrate — used as the optimistic-concurrency version on the next push.
  // Opaque string: never parse into a Date or re-serialize, or the forced UTC
  // shift on re-stringifying reintroduces the timezone bug toLocalIsoString()
  // was written to fix. Only ever set by hydrateChecklistFromServer.
  serverUpdatedAt: text('server_updated_at'),
  deletedAt: integer('deleted_at'),
});

export type PilingChecklistPile = typeof pilingChecklistPiles.$inferSelect;
export type NewPilingChecklistPile = typeof pilingChecklistPiles.$inferInsert;

// ─── Plan Steps (planned timeline per pile per day) ───────────────────────────

/**
 * Generated by the local planner — one row per pile×step with planned start/end.
 * plannedStart / plannedEnd are ISO timestamp strings.
 * These are regenerated wholesale each time "Generate Plan" is run.
 */
export const pilePlanSteps = sqliteTable('pil_plan_steps', {
  id: text('id').primaryKey(),
  checklistPileId: text('checklist_pile_id').notNull(),
  stepId: text('step_id').notNull(),
  plannedStart: text('planned_start').notNull(),
  // null means this step is "continuing" — its natural duration runs past the
  // plan window boundary, so no committed end time is persisted. A continuing
  // row is a frozen historical record: it is never back-filled with a concrete
  // plannedEnd later. Tomorrow's continuation is always a new row.
  plannedEnd: text('planned_end'),
  durationMinutes: integer('duration_minutes'),
  bufferMinutes: integer('buffer_minutes'),
  assignedMachineId: text('assigned_machine_id'),
  createdAt: integer('created_at').notNull(),
  // Phase 2 groundwork for a future delta-sync cursor — not read/written yet.
  updatedAt: integer('updated_at'),
});

export type PilePlanStep = typeof pilePlanSteps.$inferSelect;
export type NewPilePlanStep = typeof pilePlanSteps.$inferInsert;

// ─── Actual Steps (recorded actuals per pile per day) ────────────────────────

/**
 * User-recorded actual start/end times per pile×step.
 * actualStart / actualEnd are ISO timestamp strings (nullable until filled).
 */
export const pileActualSteps = sqliteTable('pil_actual_steps', {
  id: text('id').primaryKey(),
  checklistPileId: text('checklist_pile_id').notNull(),
  stepId: text('step_id').notNull(),
  actualStart: text('actual_start'),
  actualEnd: text('actual_end'),
  remarks: text('remarks'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  // The server's own `updated_at`, echoed back verbatim — see the matching
  // field/comment on pilingChecklistPiles above. Never derive this from
  // Date.now(); only hydrateChecklistFromServer may set it.
  serverUpdatedAt: text('server_updated_at'),
});

export type PileActualStep = typeof pileActualSteps.$inferSelect;
export type NewPileActualStep = typeof pileActualSteps.$inferInsert;

// ─── Machine Events (audit log for swap/breakdown reporting) ─────────────────

/**
 * User-logged machine breakdown/replacement/resume/idle events. Normally
 * recorded against a pile (and optionally a specific step) within a
 * checklist day; checklistId/pileId are null instead for a fleet-level
 * BREAKDOWN/RESUMED report made directly from the Machines screen (see
 * machinesRepository's reportMachineEvent), which has no pile/step to
 * attach to.
 * eventType: 'BREAKDOWN' | 'REPLACED' | 'RESUMED' | 'IDLE_START' | 'IDLE_END'
 * occurredAt is an ISO timestamp string (editable by the user, not always "now").
 */
export const pilMachineEvents = sqliteTable('pil_machine_events', {
  id: text('id').primaryKey(),
  checklistId: text('checklist_id'),
  pileId: text('pile_id'),
  stepId: text('step_id'),
  track: text('track').notNull(),
  eventType: text('event_type').notNull(),
  machineId: text('machine_id'),
  replacementId: text('replacement_id'),
  notes: text('notes'),
  occurredAt: text('occurred_at').notNull(),
  createdAt: integer('created_at').notNull(),
  // Phase 2 groundwork for a future delta-sync cursor — not read/written yet.
  updatedAt: integer('updated_at'),
});

export type PilMachineEvent = typeof pilMachineEvents.$inferSelect;
export type NewPilMachineEvent = typeof pilMachineEvents.$inferInsert;

// ─── Pile Measurements (one-time engineering measurements per physical pile) ─

/**
 * A fixed set of one-time engineering measurements captured per *physical*
 * pile (not per checklist-pile — a pile only ever has one E.G.L., one Pile
 * Length, etc., regardless of how many daily checklists it appears on).
 * Keyed by a unique pileId, not checklistPileId. All fields optional/
 * non-blocking, same low-friction UX as remarks — see
 * MeasurementFieldsModal.tsx and pileMeasurementTriggers.ts for which field
 * is prompted at which step's actual start/end.
 * Synced last-write-wins (no optimistic-concurrency version, unlike
 * pile_actual_steps) via the checklist push/pull payloads' `pile_measurements`
 * array — see SyncAppPlanPayload.ts / deltaPull.ts.
 */
export const pilPileMeasurements = sqliteTable('pil_pile_measurements', {
  id: text('id').primaryKey(),
  pileId: text('pile_id').notNull().unique(),
  eglM: real('egl_m'),
  pileContractorId: text('pile_contractor_id'),
  cageContractorId: text('cage_contractor_id'),
  pileLengthM: real('pile_length_m'),
  cageWeightKg: real('cage_weight_kg'),
  ctlM: real('ctl_m'),
  colM: real('col_m'),
  boreDepthM: real('bore_depth_m'),
  hookLengthM: real('hook_length_m'),
  flM: real('fl_m'),
  plannedQtyM3: real('planned_qty_m3'),
  actualQtyM3: real('actual_qty_m3'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type PilPileMeasurement = typeof pilPileMeasurements.$inferSelect;
export type NewPilPileMeasurement = typeof pilPileMeasurements.$inferInsert;

// ─── Sync Queue (offline outbox — dirty checklists awaiting push) ────────────

/**
 * Durable "dirty set" of checklists with local changes not yet confirmed
 * synced to the server. At most one row per checklistId — re-editing an
 * already-queued checklist just bumps enqueuedAt / resets status to pending.
 */
export const pilSyncQueue = sqliteTable('pil_sync_queue', {
  id: text('id').primaryKey(),
  checklistId: text('checklist_id').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'syncing' | 'failed'
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  enqueuedAt: integer('enqueued_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type PilSyncQueueRow = typeof pilSyncQueue.$inferSelect;
export type NewPilSyncQueueRow = typeof pilSyncQueue.$inferInsert;

// ─── Sync Cursor (Phase 2 groundwork — inert until Phase 3 delta sync) ───────

/**
 * Persists the site's delta-sync cursor once Phase 3 introduces
 * GET /sync/pull?cursor=. Single row per site; not read or written by
 * anything yet.
 */
export const pilSyncCursor = sqliteTable('pil_sync_cursor', {
  siteId: text('site_id').primaryKey(),
  // ISO-8601 string, consistent with every other datetime field on the wire
  // (Phase 2 scaffolded this as an integer before any real value existed —
  // corrected here in Phase 3, the first phase that actually uses it).
  cursorValue: text('cursor_value'),
  updatedAt: integer('updated_at'),
});

export type PilSyncCursorRow = typeof pilSyncCursor.$inferSelect;
export type NewPilSyncCursorRow = typeof pilSyncCursor.$inferInsert;

// ─── App Config (server-managed constants, synced from GET /shared/app-config) ─

/**
 * Generic key/value store for small tunable values the server owns (see
 * suntech-core/modules/shared/app_config/constants.py) — page sizes, debounce
 * timings, plan-generation grace windows, etc. Not piling-specific (hence no
 * `pil_` prefix), so it isn't scoped to a site.
 *
 * `value` holds JSON.stringify(rawValue) — the server returns native JSON
 * types (bool/int/string), and round-tripping through JSON.stringify/parse
 * preserves the original type without a separate value_type column, keeping
 * this table genuinely generic for whatever gets added to it later.
 */
export const appConfig = sqliteTable('app_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  syncedAt: integer('synced_at').notNull(),
});

export type AppConfigRow = typeof appConfig.$inferSelect;
export type NewAppConfigRow = typeof appConfig.$inferInsert;