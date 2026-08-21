// src/screens/Home/fillActual/useMachinePages.tsx
//
// Machine badges shown at the top of the Log Actuals screen (every Rig/Crane
// used in today's plan), each machine's piles bucketed into "active"
// (front-of-queue) vs "upcoming", and which machine badge is selected.

import React, { useMemo, useState } from 'react';
import { colors } from '@theme/theme';
import { TRACK_META } from '@utils/helpers';
import type { SwipeableTabItem } from '@components/shared/SwipeableTabBar';
import type { PilingChecklistPile } from '@db/schema';
import type { PileGroup } from '@app-types/plan';

export const EMPTY_PILE_GROUPS: PileGroup[] = [];

export type MachineBadge = { id: string; machineNo: string; type: 'RIG' | 'CRANE' };

export function useMachinePages(args: {
  checklistPiles: PilingChecklistPile[];
  machineMap: Map<string, string>;
  pileGroups: PileGroup[];
  frontPileIdByMachineId: Map<string, string>;
}): {
  activeMachines: MachineBadge[];
  pileGroupsByMachineId: Map<string, PileGroup[]>;
  machinePagesById: Map<string, { activeGroups: PileGroup[]; upcomingGroups: PileGroup[] }>;
  machineBadgeItems: SwipeableTabItem[];
  selectedMachineId: string | undefined;
  setSelectedMachineId: (id: string | undefined) => void;
} {
  const { checklistPiles, machineMap, pileGroups, frontPileIdByMachineId } = args;

  // ── Machine badges shown at the top — every Rig/Crane used in today's plan,
  // unioned with whichever machine is currently responsible for each pile's
  // track (PileGroup.rigId/craneId) so a mid-day replacement onto a machine
  // that wasn't originally planned for any pile still gets its own tab ─
  const activeMachines = useMemo((): MachineBadge[] => {
    const byMachineNo = (a: string, b: string) =>
      (machineMap.get(a) ?? a).localeCompare(machineMap.get(b) ?? b);
    const rigIds = Array.from(
      new Set([...checklistPiles.map((cp) => cp.rigId), ...pileGroups.map((g) => g.rigId)]),
    ).sort(byMachineNo);
    const craneIds = Array.from(
      new Set([
        ...checklistPiles.map((cp) => cp.craneId).filter((id): id is string => !!id),
        ...pileGroups.map((g) => g.craneId).filter((id): id is string => !!id),
      ]),
    ).sort(byMachineNo);
    return [
      ...rigIds.map((id) => ({ id, machineNo: machineMap.get(id) ?? id, type: 'RIG' as const })),
      ...craneIds.map((id) => ({ id, machineNo: machineMap.get(id) ?? id, type: 'CRANE' as const })),
    ];
  }, [checklistPiles, pileGroups, machineMap]);

  // ── Piles bucketed by machine — every pile has a rig, and a crane if one was
  // assigned, so it naturally appears (unchanged) on its rig's page and (if
  // any) its crane's page ─
  const pileGroupsByMachineId = useMemo(() => {
    const map = new Map<string, PileGroup[]>();
    for (const g of pileGroups) {
      const rigList = map.get(g.rigId);
      if (rigList) rigList.push(g);
      else map.set(g.rigId, [g]);
      if (g.craneId) {
        const craneList = map.get(g.craneId);
        if (craneList) craneList.push(g);
        else map.set(g.craneId, [g]);
      }
    }
    return map;
  }, [pileGroups]);

  // Precomputed once per real data change (not inline in renderPage, which SwipeableTabBar's
  // PagerView calls for every machine up front) so each page's props stay reference-stable
  // and MachinePilesPage's React.memo can actually skip untouched machine pages.
  const machinePagesById = useMemo(() => {
    const map = new Map<string, { activeGroups: PileGroup[]; upcomingGroups: PileGroup[] }>();
    for (const m of activeMachines) {
      const bucket = pileGroupsByMachineId.get(m.id) ?? EMPTY_PILE_GROUPS;
      const frontId = frontPileIdByMachineId.get(m.id);
      map.set(m.id, {
        activeGroups: bucket.filter((g) => g.checklistPileId === frontId),
        upcomingGroups: bucket.filter((g) => g.checklistPileId !== frontId),
      });
    }
    return map;
  }, [activeMachines, pileGroupsByMachineId, frontPileIdByMachineId]);

  const machineBadgeItems = useMemo((): SwipeableTabItem[] => {
    return activeMachines.map((m) => {
      const meta = TRACK_META[m.type];
      const Icon = meta.icon;
      return {
        value: m.id,
        label: m.machineNo,
        color: meta.color,
        renderIcon: (color: string, active: boolean) => (
          <Icon size={14} color={active ? color : colors.textSecondary} />
        ),
      };
    });
  }, [activeMachines]);

  const [selectedMachineId, setSelectedMachineId] = useState<string | undefined>(undefined);

  return {
    activeMachines,
    pileGroupsByMachineId,
    machinePagesById,
    machineBadgeItems,
    selectedMachineId,
    setSelectedMachineId,
  };
}
