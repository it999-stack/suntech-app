// src/screens/Home/hooks/useWizardData.ts
// Loads all reference data needed by the plan-generation wizard (piles, areas,
// steps, rigs/cranes, personnel, shifts) for a given site.

import { useEffect, useState } from 'react';
import { getPilesBySiteWithDimensions } from '@repositories/pilesRepository';
import { getAreasBySite } from '@repositories/areasRepository';
import { getMachinesByType } from '@repositories/machinesRepository';
import { getPersonnelBySite } from '@repositories/personnelRepository';
import { getAllShiftTypes } from '@repositories/shiftsRepository';
import { getSteps } from '@repositories/stepsRepository';
import type { PilingArea, PilingPersonnel, PilingShiftType, PilingStep } from '@db/schema';

// Re-export for consumers
export type EligiblePile = {
  id: string;
  code: string;
  dia: number;
  depth: number;
  dimensionId: string;
  areaLocation: string | null;
  areaId: string | null;
};

export type SimpleMachine = { id: string; machineNo: string; description?: string | null };

export type WizardData = {
  piles: EligiblePile[];
  areas: PilingArea[];
  steps: PilingStep[];
  rigs: SimpleMachine[];
  cranes: SimpleMachine[];
  personnel: PilingPersonnel[];
  shifts: PilingShiftType[];
  dataLoading: boolean;
};

const EMPTY: WizardData = {
  piles: [],
  areas: [],
  steps: [],
  rigs: [],
  cranes: [],
  personnel: [],
  shifts: [],
  dataLoading: true,
};

export function useWizardData(siteId: string): WizardData {
  const [data, setData] = useState<WizardData>(EMPTY);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;

    setData((prev) => ({ ...prev, dataLoading: true }));

    (async () => {
      try {
        const [pilesRaw, steps, rigsRaw, cranesRaw, personnel, shifts, areas] = await Promise.all([
          getPilesBySiteWithDimensions(siteId),
          getSteps(),
          getMachinesByType(siteId, 'RIG'),
          getMachinesByType(siteId, 'CRANE'),
          getPersonnelBySite(siteId),
          getAllShiftTypes(),
          getAreasBySite(siteId),
        ]);
        if (cancelled) return;

        setData({
          piles: pilesRaw.map((p) => ({
            id: p.id,
            code: p.pileIdCode,
            dia: p.dia,
            depth: p.depth,
            dimensionId: p.dimensionId,
            areaLocation: p.areaLocation ?? null,
            areaId: p.areaId ?? null,
          })),
          steps,
          rigs: rigsRaw.map((r) => ({ id: r.id, machineNo: r.machineNo })),
          cranes: cranesRaw.map((c) => ({ id: c.id, machineNo: c.machineNo })),
          personnel,
          shifts,
          areas,
          dataLoading: false,
        });
      } catch (err) {
        console.error('Error loading wizard data:', err);
      } finally {
        if (!cancelled) setData((prev) => ({ ...prev, dataLoading: false }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [siteId]);

  return data;
}