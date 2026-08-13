// src/screens/Home/generatePlan/usePlanPreview.ts
//
// Drives the Preview step: fetches the session's duration-template/window
// reference data once, debounces rig/crane track-override tile taps into a
// single recompute, and runs generatePlanPreview() whenever the user is on
// (or changes something on) the preview step.

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { PlanDraft } from '@/types/plan';
import type { PilingStep } from '@/db/schema';
import type { Step } from '@components/plan/generate/ProgressHeader';
import type { PlanStepWithMeta } from '@repositories/planRepository';
import {
  generatePlanPreview,
  fetchPlanReferenceData,
  type EffectivePlanWindow,
  type PlanTemplateRow,
  type PlanRawWindow,
  type PlanScheduleCache,
} from '@/services/pilingPlannerService';
import type { EligiblePile } from './useGeneratePlanData';
import { useAppConfig } from '@state/AppConfigContext';

export function usePlanPreview(args: {
  step: Step;
  draft: PlanDraft;
  updateDraft: (patch: Partial<PlanDraft>) => void;
  piles: EligiblePile[];
  siteId: string;
  selectedPlanPiles: EligiblePile[];
  steps: PilingStep[];
}): {
  pendingTrackOverrides: PlanDraft['stepTrackOverrides'];
  setPendingTrackOverrides: Dispatch<SetStateAction<PlanDraft['stepTrackOverrides']>>;
  previewSteps: PlanStepWithMeta[];
  previewWarningPileIds: string[];
  previewWindowsByMachineId: Record<string, EffectivePlanWindow[]>;
  previewRecomputing: boolean;
  previewLoading: boolean;
  planReferenceData: { templateRows: PlanTemplateRow[]; rawWindows: PlanRawWindow[] } | null;
} {
  const { step, draft, updateDraft, piles, siteId, selectedPlanPiles, steps } = args;
  const { config } = useAppConfig();

  // Not-yet-confirmed Rig/Crane tile selections from the Preview step's PilesAccordion.
  // Tapping a tile updates this immediately (instant visual feedback on the tile itself) —
  // a debounced effect below auto-commits it into draft.stepTrackOverrides after a short
  // quiet period, which is what actually triggers the recompute. Resets to the committed
  // value whenever the wizard supplies a different draft (including right after that
  // auto-commit, at which point this is a same-reference no-op — see the effect below).
  const [pendingTrackOverrides, setPendingTrackOverrides] = useState(draft.stepTrackOverrides);
  useEffect(() => {
    setPendingTrackOverrides(draft.stepTrackOverrides);
  }, [draft.stepTrackOverrides]);

  // True the instant a tile tap creates a pending change (not just once the debounce fires),
  // so the footer button's spinner+disabled state covers the whole "tapped, waiting to
  // commit, then recomputing" window, not just the recompute itself. Cleared once
  // updatePreview() applies its result. This is the only place a pending track-override
  // change is shown anywhere in the UI — no per-pile/per-row indication.
  const [hasPendingTrackChange, setHasPendingTrackChange] = useState(false);

  // Debounce: rapid tile taps coalesce into ONE recompute, ~500ms after the last tap. Each
  // pendingTrackOverrides change clears whatever timer the previous tap started before
  // scheduling a new one, so only the trailing tap's state ever actually gets committed.
  useEffect(() => {
    if (pendingTrackOverrides === draft.stepTrackOverrides) return; // nothing pending
    setHasPendingTrackChange(true);
    const timer = setTimeout(() => {
      updateDraft({ stepTrackOverrides: pendingTrackOverrides });
    }, 500);
    return () => clearTimeout(timer);
  }, [pendingTrackOverrides, draft.stepTrackOverrides]);

  const [previewSteps, setPreviewSteps] = useState<PlanStepWithMeta[]>([]);
  const [previewWarningPileIds, setPreviewWarningPileIds] = useState<string[]>([]);
  const [previewWindowsByMachineId, setPreviewWindowsByMachineId] = useState<
    Record<string, EffectivePlanWindow[]>
  >({});
  const [previewLoading, setPreviewLoading] = useState(false);

  // True from the instant a tile tap creates a pending change all the way through to the
  // recompute actually landing — drives both the footer button's spinner/disabled state and
  // (the only place a pending/in-flight recompute is shown — no per-row indication anywhere).
  // Deliberately keyed off hasPendingTrackChange (cleared only once updatePreview() finishes)
  // rather than comparing pendingTrackOverrides/draft.stepTrackOverrides directly — those two
  // become equal one render before previewLoading flips true (the debounce commits draft,
  // and only the *next* effect run starts the actual recompute), which would otherwise cause
  // a one-frame flicker back to "not recomputing" right at that handoff.
  const previewRecomputing = hasPendingTrackChange || previewLoading;

  // Duration templates + non-working windows are 100% static for the whole
  // wizard session (only siteId/shiftTypeId can actually change them) — fetched
  // once here instead of on every recompute, so tapping "Confirm Reassignment"
  // doesn't re-hit SQLite for data that hasn't moved. Cleared automatically
  // when this screen unmounts; refetched only if siteId/shiftTypeId change.
  const [planReferenceData, setPlanReferenceData] = useState<{
    templateRows: PlanTemplateRow[];
    rawWindows: PlanRawWindow[];
  } | null>(null);
  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    fetchPlanReferenceData({ siteId, shiftTypeId: draft.shiftTypeId ?? undefined }).then((data) => {
      if (!cancelled) setPlanReferenceData(data);
    });
    return () => {
      cancelled = true;
    };
  }, [siteId, draft.shiftTypeId]);

  // We generate a temporary preview whenever the user arrives at the preview step.
  const previewRequestIdRef = useRef(0);
  // Last recompute's per-component schedule cache (see PlanScheduleCache) — passed back into
  // generatePlanPreview() so a track-override-only change only reschedules the affected
  // component(s) instead of every pile. buildPlanRowsForPiles discards it wholesale via its
  // own fingerprint check whenever anything else (start time, site, machines, resumeWork,
  // pile selection...) changed, so there's no need to duplicate that "did anything else
  // change" logic here — always hand back whatever was last computed.
  const scheduleCacheRef = useRef<PlanScheduleCache | null>(null);
  async function updatePreview() {
    const requestId = ++previewRequestIdRef.current;
    if (!siteId || draft.selectedPileIds.length === 0) {
      setPreviewSteps([]);
      setPreviewWarningPileIds([]);
      setPreviewWindowsByMachineId({});
      scheduleCacheRef.current = null;
      return;
    }

    setPreviewLoading(true);
    try {
      const selectedPiles = selectedPlanPiles;
      const previewPilesInput = selectedPiles.map((pile) => {
        const assignment = draft.assignments[pile.id];
        return {
          checklistPileId: pile.id,
          pileId: pile.id,
          pileIdCode: pile.code,
          dimensionId: pile.dimensionId,
          rigId: assignment?.rig ?? '',
          craneId: assignment?.crane ?? '',
          resumeWork: draft.resumeWorkByPileId[pile.id],
          stepTrackOverrides: draft.stepTrackOverrides[pile.id],
        };
      });

      const { planRows, warningPileIds, windowsByMachineId, scheduleCache } = await generatePlanPreview({
        piles: previewPilesInput,
        planStartTime: draft.planStartTime,
        siteId,
        shiftTypeId: draft.shiftTypeId ?? undefined,
        selectedStepIds: draft.selectedStepIds,
        noNewStepCutoffMinutes: config.noNewStepCutoffMinutes,
        // steps is this screen's own already-loaded step-definition list (see
        // the initial data-loading effect above) — no need for the service to
        // fetch it again. templateRows/rawWindows come from the session cache
        // above once populated; omitted (undefined) until then, in which case
        // buildPlanRowsForPiles falls back to fetching them itself.
        referenceData: { allSteps: steps, ...planReferenceData },
        scheduleCache: scheduleCacheRef.current,
      });

      // A newer recompute (e.g. from another tap, or navigating away and back) may have
      // started and finished while this one was in flight — never let a stale response
      // clobber a fresher one (including the cache ref, which would otherwise poison the
      // next incremental diff with a result that doesn't reflect the true latest overrides).
      if (requestId !== previewRequestIdRef.current) return;

      setPreviewSteps(planRows as PlanStepWithMeta[]);
      setPreviewWarningPileIds(warningPileIds);
      setPreviewWindowsByMachineId(windowsByMachineId);
      setHasPendingTrackChange(false);
      scheduleCacheRef.current = scheduleCache;
    } catch (err) {
      if (requestId !== previewRequestIdRef.current) return;
      console.error('Error generating plan preview:', err);
      setPreviewSteps([]);
      setPreviewWarningPileIds([]);
      setPreviewWindowsByMachineId({});
      setHasPendingTrackChange(false);
    } finally {
      if (requestId !== previewRequestIdRef.current) return;
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    if (step === 'preview') {
      updatePreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, draft, piles, siteId, config.noNewStepCutoffMinutes]);

  return {
    pendingTrackOverrides,
    setPendingTrackOverrides,
    previewSteps,
    previewWarningPileIds,
    previewWindowsByMachineId,
    previewRecomputing,
    previewLoading,
    planReferenceData,
  };
}
