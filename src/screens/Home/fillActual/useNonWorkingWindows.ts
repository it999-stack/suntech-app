// src/screens/Home/fillActual/useNonWorkingWindows.ts
//
// Non-working windows (lunch, shift change, etc.) for break labels.
// Re-derived here rather than persisted at generation time — this is the
// same overlap logic the Generate Plan Preview screen already uses, just
// re-run against whatever's actually synced locally so it works regardless
// of which device generated the plan.

import { useEffect, useMemo, useState } from 'react';
import { initDb } from '@db/client';
import {
  resolveWindows,
  fetchRawWindows,
  type EffectivePlanWindow,
  type PlanRawWindow,
} from '@/services/pilingPlannerService';
import { toLocalIsoString } from '@utils/formatTime';
import type { PlanStepWithMeta } from '@repositories/planRepository';
import type { PilingDailyChecklist } from '@db/schema';

export function useNonWorkingWindows(args: {
  checklist: PilingDailyChecklist | null;
  planSteps: PlanStepWithMeta[];
}): { windowsByMachineId: Record<string, EffectivePlanWindow[]> } {
  const { checklist, planSteps } = args;

  const [rawWindows, setRawWindows] = useState<PlanRawWindow[]>([]);
  const siteId = checklist?.siteId;
  const shiftTypeId = checklist?.shiftTypeId;
  useEffect(() => {
    if (!siteId) {
      setRawWindows([]);
      return;
    }
    let cancelled = false;
    // fetchRawWindows, NOT getNonWorkingWindowsByShift: it carries the same
    // "no shift type pinned" fallback the server uses when it schedules
    // (get_effective_non_working_windows — every shift on the site). Bailing
    // out on a null shiftTypeId, as this used to, meant no windows were ever
    // found for the common case of an unpinned checklist — so a step whose
    // planned span visibly includes a lunch break showed no break at all, and
    // its displayed duration silently absorbed it.
    initDb()
      .then((db) => fetchRawWindows(db, siteId, shiftTypeId ?? undefined))
      .then((windows) => {
        if (!cancelled) setRawWindows(windows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [siteId, shiftTypeId]);

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
