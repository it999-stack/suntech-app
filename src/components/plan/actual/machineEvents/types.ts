// src/components/plan/actual/machineEvents/types.ts
//
// Shared types for MachineDownModal and MachineIdleModal (and the small
// pieces they're built from) — split out of the old combined
// MachineEventsModal.

export type Track = 'RIG' | 'CRANE' | 'COMPRESSOR';

export interface MachineEventMachine {
  id: string;
  machineNo: string;
  /** Loosely typed to match the local SQLite cache's plain string column. */
  type: string;
  status: string;
}
