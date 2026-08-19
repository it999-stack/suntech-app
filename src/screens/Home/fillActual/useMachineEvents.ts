// src/screens/Home/fillActual/useMachineEvents.ts
//
// This checklist's machine event history, plus which machines currently
// have an open self-logged idle session (most recent IDLE_START with no
// later IDLE_END) — the idle tile timer and the End Idle action both read
// off this.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getMachineEventsForChecklist } from '@repositories/machineEventsRepository';
import type { PilingDailyChecklist, PilMachineEvent } from '@db/schema';

/** An open self-logged idle session on one machine — resolved from the most
 * recent IDLE_START on that machine with no later IDLE_END. */
export interface OpenIdleSession {
  since: string;
  notes: string | null;
}

export function useMachineEvents(args: { checklist: PilingDailyChecklist | null }): {
  machineEvents: PilMachineEvent[];
  reloadMachineEvents: () => Promise<void>;
  openIdleByMachineId: Map<string, PilMachineEvent>;
  idleSessionByMachineId: Map<string, OpenIdleSession>;
} {
  const { checklist } = args;

  const [machineEvents, setMachineEvents] = useState<PilMachineEvent[]>([]);
  const reloadMachineEvents = useCallback(async () => {
    if (!checklist) {
      setMachineEvents([]);
      return;
    }
    setMachineEvents(await getMachineEventsForChecklist(checklist.id));
  }, [checklist]);
  useEffect(() => {
    reloadMachineEvents();
  }, [reloadMachineEvents]);

  // Resolves each machine's most recent IDLE_START with no later IDLE_END —
  // the pile/step it carries is the same one the End Idle action must close
  // the session out against (PilingMachineEvent requires a pile/step, so
  // ending idle reuses whichever pile/step it was started from).
  const openIdleByMachineId = useMemo(() => {
    const sorted = [...machineEvents].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const openByMachine = new Map<string, PilMachineEvent>();
    for (const e of sorted) {
      if (!e.machineId) continue;
      if (e.eventType === 'IDLE_START') openByMachine.set(e.machineId, e);
      else if (e.eventType === 'IDLE_END') openByMachine.delete(e.machineId);
    }
    return openByMachine;
  }, [machineEvents]);

  const idleSessionByMachineId = useMemo(() => {
    const map = new Map<string, OpenIdleSession>();
    for (const [machineId, e] of openIdleByMachineId) {
      map.set(machineId, { since: e.occurredAt, notes: e.notes });
    }
    return map;
  }, [openIdleByMachineId]);

  return { machineEvents, reloadMachineEvents, openIdleByMachineId, idleSessionByMachineId };
}
