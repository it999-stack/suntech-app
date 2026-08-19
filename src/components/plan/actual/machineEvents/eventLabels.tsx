// src/components/plan/actual/machineEvents/eventLabels.tsx
//
// Shared event-type union for MachineIdleModal, plus the one label helper
// MachineReplaceModal needs (MachineSelect's `kind` prop).

import type { MachineSelectKind } from '@components/plan/generate/steps/pile-assign/MachineSelect';
import type { Track } from './types';

export type IdleEventType = 'IDLE_START' | 'IDLE_END';

export function trackToMachineSelectKind(track: Track): MachineSelectKind {
  if (track === 'RIG') return 'rig';
  if (track === 'CRANE') return 'crane';
  return 'compressor';
}
