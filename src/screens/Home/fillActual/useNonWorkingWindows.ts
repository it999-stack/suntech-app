// src/screens/Home/fillActual/useNonWorkingWindows.ts
//
// Non-working windows (lunch, shift change, etc.) for break labels.
// Re-derived here rather than persisted at generation time — this is the
// same overlap logic the Generate Plan Preview screen already uses, just
// re-run against whatever's actually synced locally so it works regardless
// of which device generated the plan.

import { useEffect, useMemo, useState } from 'react';
import { getNonWorkingWindowsByShift } from '@repositories/shiftsRepository';
import { resolveWindows, type EffectivePlanWindow } from '@/services/pilingPlannerService';
import { toLocalIsoString } from '@utils/formatTime';
import type { PlanStepWithMeta } from '@repositories/planRepository';
import type { PilingDailyChecklist, PilingNonWorkingWindow } from '@db/schema';

export function useNonWorkingWindows(args: {
  checklist: PilingDailyChecklist | null;
  planSteps: PlanStepWithMeta[];
}): { windowsByMachineId: Record<string, EffectivePlanWindow[]> } {
  const { checklist, planSteps } = args;

  const [rawWindows, setRawWindows] = useState<PilingNonWorkingWindow[]>([]);
  useEffect(() => {
    if (!checklist?.shiftTypeId) {
      setRawWindows([]);
      return;
    }
    getNonWorkingWindowsByShift(checklist.shiftTypeId).then(setRawWindows).catch(() => {});
  }, [checklist?.shiftTypeId]);

  const windowsByMachineId = useMemo((): Record<string, EffectivePlanWindow[]> => {
    if (!checklist?.planStartTime || !rawWindows.length) return {};
    const resolved = resolveWindows(rawWindows, new Date(checklist.planStartTime));
    const windows: EffectivePlanWindow[] = resolved.map((w) => ({
      id: w.id,
      label: w.label,
      start: toLocalIsoString(w.start),
      end: toLocalIsoString(w.end),
    }));
    const machineIds = new Set(planSteps.map((s) => s.assignedMachineId).filter((id): id is string => !!id));
    const map: Record<string, EffectivePlanWindow[]> = {};
    for (const machineId of machineIds) map[machineId] = windows;
    return map;
  }, [rawWindows, checklist?.planStartTime, planSteps]);

  return { windowsByMachineId };
}
