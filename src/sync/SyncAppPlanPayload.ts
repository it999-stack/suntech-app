// src/sync/SyncAppPlanPayload.ts
// Type definitions for the sync-up payload sent from app to server.

export interface SyncPlanStep {
  id: string;
  checklist_pile_id: string;
  step_id: string;
  planned_start: string;
  planned_end: string | null;
  duration_minutes?: number;
  buffer_minutes?: number;
  assigned_machine_id?: string | null;
}

export interface SyncActualStep {
  id: string;
  checklist_pile_id: string;
  step_id: string;
  actual_start?: string | null;
  actual_end?: string | null;
  remarks?: string | null;
  /**
   * Which machine actually performed the step. Sent because an actual step can
   * now exist with no plan row at all (a step the scheduler never planned but
   * the crew performed once the machine came free), so the server cannot
   * recover the machine from the plan. Accepted on both this push and
   * PATCH /piling/checklist-piles/{id}/actual.
   */
  assigned_machine_id?: string | null;
  /**
   * Optimistic-concurrency base version — the server's own `updated_at`,
   * echoed back verbatim from the last pull/hydrate (see
   * pileActualSteps.serverUpdatedAt / pilingChecklistPiles.serverUpdatedAt).
   * Never derived from the device clock.
   */
  updated_at?: string | null;
}

/**
 * One physical pile's one-time engineering measurements — keyed by pile_id
 * (not checklist_pile_id), all fields but pile_id optional. Upserted
 * server-side keyed by pile_id, plain last-write-wins (no
 * optimistic-concurrency check, unlike actual_steps). See
 * pilPileMeasurements in db/schema.ts.
 */
export interface SyncPileMeasurement {
  pile_id: string;
  egl_m?: number | null;
  pile_contractor_id?: string | null;
  cage_contractor_id?: string | null;
  pile_length_m?: number | null;
  cage_weight_kg?: number | null;
  ctl_m?: number | null;
  col_m?: number | null;
  bore_depth_m?: number | null;
  hook_length_m?: number | null;
  fl_m?: number | null;
  planned_qty_m3?: number | null;
  actual_qty_m3?: number | null;
}

export interface SyncMachineEvent {
  id: string;
  pile_id: string;
  step_id?: string | null;
  track: string;
  event_type: string;
  machine_id?: string | null;
  replacement_id?: string | null;
  notes?: string | null;
  occurred_at: string;
}

export interface SyncChecklistPile {
  id: string;
  pile_id: string;
  seq_no: number;
  rig_id: string;
  crane_id: string | null;
  status: string;
  /**
   * Optimistic-concurrency base version — the server's own `updated_at`,
   * echoed back verbatim from the last pull/hydrate (see
   * pileActualSteps.serverUpdatedAt / pilingChecklistPiles.serverUpdatedAt).
   * Never derived from the device clock.
   */
  updated_at?: string | null;
}

export interface SyncChecklistPersonnel {
  id: string;
  personnel_id: string;
  role: string;
  machine_id?: string | null;
  shift_slot?: number | null;
}

export interface SyncChecklist {
  id: string;
  date: string;
  shift_type_id?: string;
  plan_start_time?: string;
  plan_end_time?: string;
  notes?: string;
  status: string;
  personnel: SyncChecklistPersonnel[];
  piles: SyncChecklistPile[];
  plan_steps: SyncPlanStep[];
  actual_steps: SyncActualStep[];
  machine_events: SyncMachineEvent[];
  pile_measurements: SyncPileMeasurement[];
}

export interface SyncAppPlanPayload {
  checklists: SyncChecklist[];
}

export interface SyncConflict {
  entity: 'actual_step' | 'checklist_pile';
  id: string;
  reason: string;
  /** Absent when the conflict is not a version race — an actual step rejected
   * for falling outside its checklist day has no server version to catch up
   * to, because the row was never stored. */
  current_updated_at?: string;
  /** Human-readable explanation, present only for rejections the operator can
   * act on (reason === 'outside_plan_window'). */
  detail?: string;
}

/**
 * Echoes back the fresh `updated_at` for a row this push actually wrote,
 * keyed by the id this client submitted it under — lets the client advance
 * its local optimistic-concurrency cache (pileActualSteps.serverUpdatedAt /
 * pilingChecklistPiles.serverUpdatedAt) immediately instead of waiting on
 * the next pull, which closes the window where a client's own rapid
 * back-to-back edits could get rejected as a false self-conflict.
 */
export interface SyncedVersion {
  entity: 'actual_step' | 'checklist_pile';
  id: string;
  updated_at: string;
}

/**
 * A pushed checklist the server discarded instead of applying, because that
 * day's plan has been deleted server-side.
 *
 * Reported separately from `errors` on purpose: an error means "retry later",
 * and this can never succeed — leaving it in the sync queue would both spin
 * forever and keep the local copy pinned (deltaPull won't purge a checklist
 * that still has queued edits). Treated as synced by deltaPush so the queue
 * row clears and the following pull can remove it.
 */
export interface SyncDroppedChecklist {
  id: string;
  /** Currently always 'deleted'. */
  reason: string;
}

export interface SyncAppPlanResponse {
  success: boolean;
  checklists_synced: number;
  plan_steps_synced: number;
  actual_steps_synced: number;
  machine_events_synced: number;
  /** Informational only — the server never reports per-row conflicts for
   * measurements (plain last-write-wins, no optimistic-concurrency check). */
  pile_measurements_synced?: number;
  errors?: Array<{ checklist_id: string; error: string }>;
  conflicts?: SyncConflict[];
  synced_versions?: SyncedVersion[];
  dropped_checklists?: SyncDroppedChecklist[];
}