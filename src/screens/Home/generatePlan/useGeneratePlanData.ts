// src/screens/Home/generatePlan/useGeneratePlanData.ts
//
// Loads every reference dataset GeneratePlanScreen's wizard steps need for a
// given site — piles, steps, machines, personnel, shifts, locations, and role
// defaults — in one batched fetch.

import { useEffect, useState } from 'react';
import { getPilesBySiteWithDimensions, PileWithDimension } from '@repositories/pilesRepository';
import { getLocationsBySite } from '@repositories/locationsRepository';
import { getMachinesByType } from '@repositories/machinesRepository';
import { getPersonnelBySite } from '@repositories/personnelRepository';
import { getRoleDefaultsBySite } from '@repositories/roleDefaultsRepository';
import { getAllShiftTypes } from '@repositories/shiftsRepository';
import { getSteps } from '@repositories/stepsRepository';
import type { PilingLocation, PilingSitePersonnel, PilingShiftType, PilingStep, PilingSiteRoleDefault } from '@/db/schema';

export type EligiblePile = PileWithDimension & {
  /** Alias for pileIdCode for convenience */
  code: string;
};

export type SimpleMachine = { id: string; machineNo: string; description?: string | null; status: string };

export function useGeneratePlanData(siteId: string): {
  piles: EligiblePile[];
  locations: PilingLocation[];
  steps: PilingStep[];
  rigs: SimpleMachine[];
  cranes: SimpleMachine[];
  personnel: PilingSitePersonnel[];
  shifts: PilingShiftType[];
  roleDefaults: PilingSiteRoleDefault[];
  dataLoading: boolean;
} {
  const [piles, setPiles] = useState<EligiblePile[]>([]);
  const [locations, setLocations] = useState<PilingLocation[]>([]);
  const [steps, setSteps] = useState<PilingStep[]>([]);
  const [rigs, setRigs] = useState<SimpleMachine[]>([]);
  const [cranes, setCranes] = useState<SimpleMachine[]>([]);
  const [personnel, setPersonnel] = useState<PilingSitePersonnel[]>([]);
  const [shifts, setShifts] = useState<PilingShiftType[]>([]);
  const [roleDefaults, setRoleDefaults] = useState<PilingSiteRoleDefault[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    (async () => {
      setDataLoading(true);
      try {
        const [pilesRaw, stepsRaw, rigsRaw, cranesRaw, personnelRaw, shiftsRaw, locationsRaw, roleDefaultsRaw] = await Promise.all([
          getPilesBySiteWithDimensions(siteId),
          getSteps(),
          getMachinesByType(siteId, 'RIG'),
          getMachinesByType(siteId, 'CRANE'),
          getPersonnelBySite(siteId),
          getAllShiftTypes(),
          getLocationsBySite(siteId),
          getRoleDefaultsBySite(siteId),
        ]);
        if (cancelled) return;
        setPiles(
          pilesRaw.map((p) => ({
            ...p,
            code: p.pileIdCode,
          })),
        );
        setSteps(stepsRaw);
        setRigs(rigsRaw.map((r: typeof rigsRaw[0]) => ({ id: r.id, machineNo: r.machineNo, status: r.status })));
        setCranes(cranesRaw.map((c: typeof cranesRaw[0]) => ({ id: c.id, machineNo: c.machineNo, status: c.status })));
        setPersonnel(personnelRaw);
        setShifts(shiftsRaw);
        setLocations(locationsRaw);
        setRoleDefaults(roleDefaultsRaw);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  return { piles, locations, steps, rigs, cranes, personnel, shifts, roleDefaults, dataLoading };
}
