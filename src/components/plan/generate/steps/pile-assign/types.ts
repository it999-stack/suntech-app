// src/components/plan/generate/steps/pile-assign/types.ts

export interface EligiblePile { id: string; code: string; dia: number; depth: number; }
export interface SimpleMachine { id: string; machineNo: string; }
export type MachineKind = 'rig' | 'crane';
export type PileFilter = 'all' | 'pending' | 'assigned';