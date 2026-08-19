// src/components/plan/actual/machineEvents/idleSession.ts
//
// Finds a machine's still-open "session" within a list of machine events —
// the most recent opening event with no later closing event. Used for both
// idle (open: IDLE_START, close: IDLE_END) in MachineIdleModal and
// breakdown (open: BREAKDOWN, close: RESUMED — REPLACED does NOT close a
// breakdown, the original machine stays reported down) in MachineDownModal.

import type { PilMachineEvent } from '@db/schema';

export function findOpenSession(
  history: PilMachineEvent[],
  machineId: string | undefined,
  openType: string,
  closeTypes: string[],
): PilMachineEvent | undefined {
  if (!machineId) return undefined;
  const sorted = history
    .filter((h) => h.machineId === machineId && (h.eventType === openType || closeTypes.includes(h.eventType)))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  let open: PilMachineEvent | undefined;
  for (const h of sorted) {
    open = h.eventType === openType ? h : undefined;
  }
  return open;
}
