// src/screens/Home/fillActual/useMachineEventActions.ts
//
// Logging machine events both from an open PileStepsModal
// (handleLogMachineEvent) and from a machine card's quick actions —
// Breakdown / Start idle / End idle — which aren't tied to any open pile
// modal. End idle closes out the pile/step its idle session was started on;
// Breakdown and Start idle attach to whichever step is currently in
// progress for the machine.

import { useCallback, useMemo, useState } from 'react';
import type { LogMachineEventInput } from '@state/PlanContext';
import type { PilingChecklistPile, PilMachineEvent } from '@db/schema';
import type { PileGroup } from '@app-types/plan';
import { notify } from '@utils/notify';

export type CardEventType = 'BREAKDOWN' | 'IDLE_START' | 'IDLE_END';

export function useMachineEventActions(args: {
  openGroup: PileGroup | null;
  checklistPiles: PilingChecklistPile[];
  machineEvents: PilMachineEvent[];
  openIdleByMachineId: Map<string, PilMachineEvent>;
  currentStepByMachineId: Map<string, { checklistPileId: string; stepId: string }>;
  machineMap: Map<string, string>;
  logMachineEvent: (checklistPileId: string, stepId: string, input: LogMachineEventInput) => Promise<void>;
  reloadMachines: () => Promise<void>;
  reloadMachineEvents: () => Promise<void>;
}): {
  handleLogMachineEvent: (stepId: string, input: LogMachineEventInput) => Promise<void>;
  machineEventFor: {
    machineId: string;
    machineNo: string;
    track: 'RIG' | 'CRANE' | 'COMPRESSOR';
    checklistPileId: string;
    stepId: string;
    eventType: CardEventType;
  } | null;
  handleOpenMachineEvent: (machineId: string, track: 'RIG' | 'CRANE', eventType: CardEventType) => void;
  handleLogMachineEventForCard: (input: LogMachineEventInput) => Promise<void>;
  machineEventHistory: PilMachineEvent[];
  closeMachineEvent: () => void;
} {
  const {
    openGroup,
    checklistPiles,
    machineEvents,
    openIdleByMachineId,
    currentStepByMachineId,
    machineMap,
    logMachineEvent,
    reloadMachines,
    reloadMachineEvents,
  } = args;

  const handleLogMachineEvent = useCallback(
    async (stepId: string, input: LogMachineEventInput) => {
      if (!openGroup) return;
      await logMachineEvent(openGroup.checklistPileId, stepId, input);
      await Promise.all([reloadMachines(), reloadMachineEvents()]);
    },
    [openGroup, logMachineEvent, reloadMachines, reloadMachineEvents],
  );

  const checklistPileIdByPileId = useMemo(
    () => new Map(checklistPiles.map((cp) => [cp.pileId, cp.id])),
    [checklistPiles],
  );

  const [machineEventFor, setMachineEventFor] = useState<{
    machineId: string;
    machineNo: string;
    track: 'RIG' | 'CRANE' | 'COMPRESSOR';
    checklistPileId: string;
    stepId: string;
    eventType: CardEventType;
  } | null>(null);

  const handleOpenMachineEvent = useCallback(
    (machineId: string, track: 'RIG' | 'CRANE', eventType: CardEventType) => {
      let checklistPileId: string | undefined;
      let stepId: string | undefined;

      if (eventType === 'IDLE_END') {
        const open = openIdleByMachineId.get(machineId);
        checklistPileId = open?.pileId ? checklistPileIdByPileId.get(open.pileId) : undefined;
        stepId = open?.stepId ?? undefined;
      } else {
        const current = currentStepByMachineId.get(machineId);
        checklistPileId = current?.checklistPileId;
        stepId = current?.stepId;
      }

      if (!checklistPileId || !stepId) {
        notify.error('This machine has no pile in progress right now.', { title: 'No active step' });
        return;
      }

      setMachineEventFor({
        machineId,
        machineNo: machineMap.get(machineId) ?? machineId,
        track,
        checklistPileId,
        stepId,
        eventType,
      });
    },
    [openIdleByMachineId, checklistPileIdByPileId, currentStepByMachineId, machineMap],
  );

  const handleLogMachineEventForCard = useCallback(
    async (input: LogMachineEventInput) => {
      if (!machineEventFor) return;
      await logMachineEvent(machineEventFor.checklistPileId, machineEventFor.stepId, input);
      await Promise.all([reloadMachines(), reloadMachineEvents()]);
      setMachineEventFor(null);
    },
    [machineEventFor, logMachineEvent, reloadMachines, reloadMachineEvents],
  );

  const machineEventHistory = useMemo(
    () => (machineEventFor ? machineEvents.filter((e) => e.machineId === machineEventFor.machineId) : []),
    [machineEvents, machineEventFor],
  );

  const closeMachineEvent = useCallback(() => setMachineEventFor(null), []);

  return {
    handleLogMachineEvent,
    machineEventFor,
    handleOpenMachineEvent,
    handleLogMachineEventForCard,
    machineEventHistory,
    closeMachineEvent,
  };
}
