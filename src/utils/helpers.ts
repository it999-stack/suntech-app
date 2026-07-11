// src/utils/helpers.ts
// General-purpose helper functions and shared domain types.

import { colors } from '@/theme/theme';

// ---------------------------------------------------------------------------
// Machine types
// ---------------------------------------------------------------------------

export type MachineKind = 'RIG' | 'CRANE';

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
      : colors.machine.craneColors;
  return palette[indexWithinType % palette.length];
}
