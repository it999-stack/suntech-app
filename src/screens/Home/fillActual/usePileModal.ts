// src/screens/Home/fillActual/usePileModal.ts
//
// Which pile's PileStepsModal is currently open, and the resolved group for it.

import { useCallback, useState } from 'react';
import type { PileGroup } from '@app-types/plan';

export function usePileModal(args: { pileGroups: PileGroup[] }): {
  openCpId: string | null;
  setOpenCpId: (id: string | null) => void;
  /** The group PileStepsModal should render — stays non-null through the
   * close animation (see isPileModalVisible/handlePileModalClosed) so
   * AppModal doesn't get torn out of the tree before it can play it. */
  openGroup: PileGroup | null;
  /** Drives PileStepsModal's `visible` prop — flips to false the instant
   * close is requested, immediately, which is what lets AppModal's own
   * close tween actually start. */
  isPileModalVisible: boolean;
  /** Pass as PileStepsModal's `onClosed` — called once the close tween has
   * genuinely finished, which is the only point it's safe to stop
   * rendering PileStepsModal at all. */
  handlePileModalClosed: () => void;
} {
  const { pileGroups } = args;
  const [openCpId, setOpenCpId] = useState<string | null>(null);
  const liveGroup = openCpId ? (pileGroups.find((g) => g.checklistPileId === openCpId) ?? null) : null;

  // Keeps rendering the last live group through the close animation instead
  // of unmounting the instant openCpId clears — React's documented "adjust
  // state during render" pattern, so this stays in sync with liveGroup with
  // no extra render/tick of lag while open.
  const [mountedGroup, setMountedGroup] = useState<PileGroup | null>(null);
  if (liveGroup && liveGroup !== mountedGroup) {
    setMountedGroup(liveGroup);
  }

  const handlePileModalClosed = useCallback(() => setMountedGroup(null), []);

  return {
    openCpId,
    setOpenCpId,
    openGroup: mountedGroup,
    isPileModalVisible: !!liveGroup,
    handlePileModalClosed,
  };
}
