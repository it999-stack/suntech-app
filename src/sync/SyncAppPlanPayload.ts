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
  crane_id: string;
  status: string;
}

export interface SyncChecklistPersonnel {
  id: string;
  personnel_id: string;
}

export interface SyncChecklist {
  id: string;
  date: string;
  shift_type_id?: string;
  plan_start_time?: string;
  plan_end_time?: string;
  supervisor_id?: string;
  supervisor_id_2?: string;
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

export interface SyncAppPlanResponse {
  success: boolean;
  checklists_synced: number;
  plan_steps_synced: number;
  actual_steps_synced: number;
  machine_events_synced: number;
  errors?: Array<{ checklist_id: string; error: string }>;
}