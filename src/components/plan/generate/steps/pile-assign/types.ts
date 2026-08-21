// src/components/plan/generate/steps/pile-assign/types.ts

export interface EligiblePile {
  id: string; code: string; dia: number; depth: number; locationId: string | null;
  /** Fully completed on a prior day (findResumeWorkForPiles) — rendered faded/non-selectable in PileAssignStep. */
  completed?: boolean;
}
export interface SimpleMachine { id: string; machineNo: string; }
export type MachineKind = 'rig' | 'crane';
export type PileFilter = 'all' | 'pending' | 'assigned';

/** Sentinel activeLocationId meaning "every area for this plan" — the area
 * pill row's own "All" pill, distinct from any real location id. */
export const ALL_LOCATIONS_ID = '__all__';