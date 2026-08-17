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
   * Optimistic-concurrency base version — the server's own `updated_at`,
   * echoed back verbatim from the last pull/hydrate (see
   * pileActualSteps.serverUpdatedAt / pilingChecklistPiles.serverUpdatedAt).
   * Never derived from the device clock.
   */
  updated_at?: string | null;
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
}

export interface SyncAppPlanPayload {
  checklists: SyncChecklist[];
}

export interface SyncConflict {
  entity: 'actual_step' | 'checklist_pile';
  id: string;
  reason: string;
  current_updated_at: string;
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

export interface SyncAppPlanResponse {
  success: boolean;
  checklists_synced: number;
  plan_steps_synced: number;
  actual_steps_synced: number;
  machine_events_synced: number;
  errors?: Array<{ checklist_id: string; error: string }>;
  conflicts?: SyncConflict[];
  synced_versions?: SyncedVersion[];
}