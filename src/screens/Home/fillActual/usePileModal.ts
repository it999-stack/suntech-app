// src/screens/Home/fillActual/usePileModal.ts
//
// Which pile's PileStepsModal is currently open, and the resolved group for it.

import { useState } from 'react';
import type { PileGroup } from '@app-types/plan';

export function usePileModal(args: { pileGroups: PileGroup[] }): {
  openCpId: string | null;
  setOpenCpId: (id: string | null) => void;
  openGroup: PileGroup | null;
} {
  const { pileGroups } = args;
  const [openCpId, setOpenCpId] = useState<string | null>(null);
  const openGroup = pileGroups.find((g) => g.checklistPileId === openCpId) ?? null;

  return { openCpId, setOpenCpId, openGroup };
}
