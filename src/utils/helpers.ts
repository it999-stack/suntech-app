// src/utils/helpers.ts
// General-purpose helper functions and shared domain types.

import { colors } from '@/theme/theme';
import * as Crypto from 'expo-crypto';

// ---------------------------------------------------------------------------
// Machine types
// ---------------------------------------------------------------------------

export type MachineKind = 'RIG' | 'CRANE' | 'COMPRESSOR';

export interface MachineLike {
  id: string;
  type: MachineKind;
}

// ---------------------------------------------------------------------------
// Machine color helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic color for a machine based on its type and its position
 * *within that type's list* — so a rig's color stays stable even if rigs
 * and cranes are interleaved differently on some other screen.
 */
export function getMachineColor(machine: MachineLike, indexWithinType: number): string {
  const palette =
    machine.type === 'RIG'
      ? colors.machine.rigColors
      : machine.type === 'CRANE'
        ? colors.machine.craneColors
        : colors.machine.compressorColors;
  return palette[indexWithinType % palette.length];
}

// generate uuid
export function generateId(): string {
  return Crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Plan step timing helpers
// ---------------------------------------------------------------------------

/**
 * True when a plan step's natural duration runs past the plan window
 * boundary, so no committed plannedEnd was persisted for it ("continuing").
 */
export function isContinuingStep(step: { plannedEnd: string | null | undefined }): boolean {
  return step.plannedEnd == null;
}