// src/screens/Home/fillActual/useReplanPrompt.ts
//
// After a step is paused, the rest of the day is stale: the machine that
// walked away is free earlier than planned, whoever picks the work up is busy
// later than planned, and the paused step's own remainder still needs a slot.
// The server can recompute all of that — it derives the resume point and the
// remaining duration from the sessions just recorded (see classify_piles).
//
// It is OFFERED, not automatic. Pausing has to work offline and has to be
// instant; a re-plan needs the network and reshuffles the machine's queue,
// which is the supervisor's call rather than a side effect of logging a time.
// So the pause is already durable by the time this appears, and declining it
// (or having no signal) costs nothing but a stale plan until the next edit.

import { useCallback, useState } from 'react';

import type { EditPlanPileInput, EditPlanPreview } from '@state/PlanContext';
import type { PilingChecklistPile, PilingDailyChecklist } from '@db/schema';
import type { PileGroup } from '@app-types/plan';
import { notify } from '@utils/notify';

export function useReplanPrompt(args: {
  siteId: string;
  checklist: PilingDailyChecklist | null;
  workingDate: string;
  checklistPiles: PilingChecklistPile[];
  pileGroups: PileGroup[];
  previewEditPlanMidDay: (
    siteId: string,
    checklistId: string,
    piles: EditPlanPileInput[],
  ) => Promise<EditPlanPreview>;
  editPlanMidDay: (
    siteId: string,
    checklistId: string,
    date: string,
    piles: EditPlanPileInput[],
  ) => Promise<unknown>;
}) {
  const {
    siteId,
    checklist,
    workingDate,
    checklistPiles,
    pileGroups,
    previewEditPlanMidDay,
    editPlanMidDay,
  } = args;

  const [preview, setPreview] = useState<EditPlanPreview | null>(null);
  const [pendingPiles, setPendingPiles] = useState<EditPlanPileInput[] | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  /** Every pile on the checklist, in its CURRENT machine assignment — the same
   * payload shape the reorder editor sends. A mid-day edit is always the whole
   * day: the server decides what is locked, what is running and what can move
   * (see classify_piles), so sending one pile would silently drop the rest. */
  const buildPiles = useCallback((): EditPlanPileInput[] => {
    const groupByPileId = new Map(pileGroups.map((g) => [g.pileId, g]));
    return checklistPiles.map((cp) => {
      const group = groupByPileId.get(cp.pileId);
      return {
        pileId: cp.pileId,
        rigId: group?.rigId ?? cp.rigId,
        craneId: group?.craneId ?? (cp.craneId ?? undefined),
        // A CRANE-track step running on a rig is an override the server cannot
        // re-derive — it is a generation-time input that is never persisted,
        // so it has to be reconstructed from where the work actually landed
        // or the re-plan quietly moves those steps back onto the crane.
        stepTrackOverrides: (group?.steps ?? [])
          .filter((s) => (s.businessTrack ?? s.track) === 'CRANE' && s.track === 'RIG')
          .map((s) => s.stepId),
      };
    });
  }, [checklistPiles, pileGroups]);

  /**
   * Ask the server what a re-plan would do, and open the prompt if it would do
   * anything. Call after a pause has been recorded.
   *
   * Deliberately silent on failure. This runs unprompted right after the
   * supervisor logged a time, so a dropped connection or a server-side
   * rejection must not throw an error at them for something they did not ask
   * for — the pause is saved either way, and the plan can be re-run from Edit
   * Sequence whenever they choose.
   */
  const offerReplan = useCallback(async () => {
    if (!checklist) return;
    setIsChecking(true);
    try {
      const piles = buildPiles();
      const result = await previewEditPlanMidDay(siteId, checklist.id, piles);
      // Nothing reschedulable — every pile locked, running, or already done.
      // Prompting for a no-op would just train people to dismiss it.
      if (!result.piles.length) return;
      setPendingPiles(piles);
      setPreview(result);
    } catch {
      // Intentionally swallowed — see the doc comment.
    } finally {
      setIsChecking(false);
    }
  }, [buildPiles, checklist, previewEditPlanMidDay, siteId]);

  const dismiss = useCallback(() => {
    setPreview(null);
    setPendingPiles(null);
  }, []);

  /** Commit the plan the preview showed. Errors DO surface here — the
   * supervisor asked for this one. */
  const confirmReplan = useCallback(async () => {
    if (!checklist || !pendingPiles) return;
    setIsApplying(true);
    try {
      await editPlanMidDay(siteId, checklist.id, workingDate, pendingPiles);
      dismiss();
    } catch (err) {
      const message =
        (err as any)?.response?.data?.detail ||
        (err instanceof Error ? err.message : 'Please try again.');
      notify.error(message, { title: 'Could not re-plan' });
    } finally {
      setIsApplying(false);
    }
  }, [checklist, dismiss, editPlanMidDay, pendingPiles, siteId, workingDate]);

  return { preview, isChecking, isApplying, offerReplan, confirmReplan, dismiss };
}
