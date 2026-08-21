// src/components/plan/generate/preview/PilesAccordion.tsx
//
// Replaces the flat per-pile accordion list. Shows one pill per pile in a
// swipeable bar (SwipeableTabBar) — tapping a pill or swiping the content
// switches which single pile's steps are shown below.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Layers, Coffee, PencilLine } from 'lucide-react-native';
import Accordion from '@components/shared/Accordion';
import Avatar from '@components/shared/Avatar';
import InfoRow from '@components/shared/InfoRow';
import SwipeableTabBar, { type SwipeableTabItem } from '@components/shared/SwipeableTabBar';
import StepTimelineRow from './StepTimelineRow';
import type { TrackChoice } from './TrackChoiceTiles';
import {
  computeTotalDuration,
  computeMachineOccupancyMinutes,
  computePileStepBreaks,
  splitStepByInternalWindows,
} from './previewUtils';
import type { PlanStepWithMeta, ActualStepWithMeta } from '@repositories/planRepository';
import type { PreviewPile } from '@app-types/previewTypes';
import type { EffectivePlanWindow } from '@/services/pilingPlannerService';
import type { PilingStep } from '@/db/schema';
import type { ResumeWork } from '@/types/plan';
import { colors, spacing, typography, radius } from '@/theme/theme';
import { TRACK_META } from '@/utils/helpers';
import { formatDurationMinutes, formatTime } from '@/utils/formatTime';

const EMPTY_STEPS: PlanStepWithMeta[] = [];
const EMPTY_ACTUAL_STEPS: ActualStepWithMeta[] = [];
const EMPTY_STEP_IDS: string[] = [];

/** A real, configured non-working window (lunch/tea break etc.) shown between the two steps
 * it falls between — visually distinct from a StepTimelineRow so it doesn't read as a step. */
function PileBreakRow({ label, start, end }: { label: string; start: string; end: string }) {
  return (
    <View style={styles.breakRow}>
      <Coffee size={14} color={colors.machines.break} />
      <Text style={styles.breakText}>
        {label} · {formatTime(start)} – {formatTime(end)}
      </Text>
    </View>
  );
}

interface PilePreviewPageProps {
  pile: PreviewPile;
  /** This pile's own steps, already filtered from planSteps and sorted — a stable
   * reference (see stepsByPileId below) unless this specific pile's schedule changed. */
  steps: PlanStepWithMeta[];
  actualSteps: ActualStepWithMeta[];
  /** This pile's own slice of the pending/committed track-override map — stable across
   * renders where some *other* pile's overrides changed (GeneratePlanScreen/PreviewStep only
   * ever replace the touched pile's entry, never rebuild every pile's array). */
  overriddenStepIds: string[];
  onToggleTrack?: (checklistPileId: string, stepId: string, track: TrackChoice) => void;
  windowsByMachineId?: Record<string, EffectivePlanWindow[]>;
  allSteps: PilingStep[];
  selectedStepIds: string[];
  resumeWork?: ResumeWork;
  /** Opens the machine-reassignment panel for this pile. Omitted on read-only screens
   * (e.g. PlanDetailScreen) so the rows below render non-interactive, with no pencil icon. */
  onPressMachineBadge?: (pileId: string) => void;
}

/** One pile's page content inside the swipeable bar. Memoized because SwipeableTabBar's
 * PagerView mounts every pile's page up front (needed for swipe), so without this every
 * pile would redo its full step/duration/breaks computation on every render — including
 * the two renders a single tile tap causes before the debounced recompute even starts. */
const PilePreviewPage = React.memo(function PilePreviewPage({
  pile,
  steps,
  actualSteps,
  overriddenStepIds,
  onToggleTrack,
  windowsByMachineId,
  allSteps,
  selectedStepIds,
  resumeWork,
  onPressMachineBadge,
}: PilePreviewPageProps) {
  const totalDuration = formatDurationMinutes(computeTotalDuration(steps));
  // Occupancy is derived from the CONFIRMED schedule (steps) only — a pending,
  // not-yet-confirmed tile selection never affects this, same as the step times below.
  const rigOccupancy = formatDurationMinutes(computeMachineOccupancyMinutes(steps, pile.rigId));
  const craneOccupancy = formatDurationMinutes(computeMachineOccupancyMinutes(steps, pile.craneId));
  const actualByStepId = new Map(actualSteps.map((a) => [a.stepId, a]));
  const breaksByIndex = new Map<number, ReturnType<typeof computePileStepBreaks>>();
  for (const b of computePileStepBreaks(steps, windowsByMachineId ?? {})) {
    const list = breaksByIndex.get(b.beforeIndex);
    if (list) list.push(b);
    else breaksByIndex.set(b.beforeIndex, [b]);
  }
  // Breaks are only meaningful relative to the CONFIRMED schedule (steps) — this
  // maps a scheduled step's id back to its index there, so an unplanned synthetic
  // row (added below) never tries to look one up.
  const scheduledIndexByStepId = new Map(steps.map((s, idx) => [s.stepId, idx]));

  // Steps already completed on this pile's most recent past checklist —
  // shown as completed rows (with real historical times) instead of being
  // dropped from the list entirely.
  const historicalCompletedByStepId = new Map(
    (resumeWork?.completedSteps ?? []).map((c) => [c.stepId, c]),
  );

  // Full applicable-step set for this pile — every selected step, including
  // ones already completed before the resume point — so a step that didn't
  // get scheduled (cut off by the plan-window limit) still shows, faded,
  // instead of vanishing. Falls back to just `steps` (today's behavior) when
  // the caller doesn't pass allSteps (e.g. PlanDetailScreen, which has no
  // selectedStepIds/resume concept).
  let displaySteps: PlanStepWithMeta[] = steps;
  if (allSteps.length > 0) {
    const selectedStepIdSet = new Set(selectedStepIds);
    const applicableSteps = allSteps
      .filter((s) => selectedStepIdSet.has(s.id))
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    const scheduledByStepId = new Map(steps.map((s) => [s.stepId, s]));
    displaySteps = applicableSteps.map(
      (s) =>
        scheduledByStepId.get(s.id) ??
        ({
          id: `unplanned-${pile.checklistPileId}-${s.id}`,
          checklistPileId: pile.checklistPileId,
          stepId: s.id,
          stepName: s.stepName,
          track: s.track,
          sequenceOrder: s.sequenceOrder,
          plannedStart: '',
          plannedEnd: null,
          durationMinutes: 0,
          bufferMinutes: 0,
          assignedMachineId: null,
        } as unknown as PlanStepWithMeta),
    );
  }

  return (
    <View>
      <View style={styles.pileHeaderTopRow}>
        <View style={styles.pileHeaderLeft}>
          <Text style={styles.pileCode}>{pile.code}</Text>
          <Text style={styles.pileMeta}>
            ({pile.dia}mm · {pile.depth}m)
          </Text>
        </View>
        <Text style={styles.pileDuration}>{totalDuration}</Text>
      </View>
      <View style={styles.pileMachinesRow}>
        <InfoRow
          leading={
            <Avatar
              name={pile.rigMachineNo}
              icon={TRACK_META.RIG.icon}
              size={40}
              backgroundColor={TRACK_META.RIG.color}
              borderColor={TRACK_META.RIG.color}
              textColor={colors.white}
            />
          }
          title={pile.rigMachineNo}
          caption={rigOccupancy}
          accentColor={TRACK_META.RIG.color}
          onPress={onPressMachineBadge ? () => onPressMachineBadge(pile.id) : undefined}
          trailing={onPressMachineBadge ? <PencilLine size={14} color={TRACK_META.RIG.color} /> : undefined}
        />
        {pile.craneMachineNo ? (
          <InfoRow
            leading={
              <Avatar
                name={pile.craneMachineNo}
                icon={TRACK_META.CRANE.icon}
                size={40}
                backgroundColor={TRACK_META.CRANE.color}
                borderColor={TRACK_META.CRANE.color}
                textColor={colors.white}
              />
            }
            title={pile.craneMachineNo}
            caption={craneOccupancy}
            accentColor={TRACK_META.CRANE.color}
            onPress={onPressMachineBadge ? () => onPressMachineBadge(pile.id) : undefined}
            trailing={onPressMachineBadge ? <PencilLine size={14} color={TRACK_META.CRANE.color} /> : undefined}
          />
        ) : (
          <InfoRow
            leading={<Avatar name={null} icon={TRACK_META.CRANE.icon} size={40} />}
            title="None assigned"
            titleMuted
            caption="Crane"
            onPress={onPressMachineBadge ? () => onPressMachineBadge(pile.id) : undefined}
            trailing={onPressMachineBadge ? <PencilLine size={14} color={colors.textSecondary} /> : undefined}
          />
        )}
      </View>

      <View style={styles.stepsContainer}>
        {displaySteps.length === 0 ? (
          <Text style={styles.noSteps}>No plan steps generated for this pile.</Text>
        ) : (
          displaySteps.map((s, idx) => {
            const historical = historicalCompletedByStepId.get(s.stepId);
            const isPlanned = s.plannedStart !== '' || !!historical;
            const scheduledIdx = scheduledIndexByStepId.get(s.stepId);
            const isCompleted = !!actualByStepId.get(s.stepId)?.actualEnd || !!historical;
            const completedStartIso = actualByStepId.get(s.stepId)?.actualStart ?? historical?.actualStart ?? undefined;
            const completedEndIso = actualByStepId.get(s.stepId)?.actualEnd ?? historical?.actualEnd ?? undefined;
            // Eligibility is the step's nominal (business) track, not the currently-displayed
            // one — once overridden, `s.track` reads as 'RIG', but the tiles must stay offered
            // so it can be toggled back. Falls back to `s.track` where businessTrack isn't
            // populated (persisted rows never set it, and never pass onToggleTrack anyway).
            //
            // Deliberately offered for unplanned rows too: a Crane-track step most often goes
            // unplanned because the *shared* Crane pool is busy with other piles' work, not
            // because this pile's own Rig is out of room — overriding to Rig is exactly the
            // escape hatch for that case.
            const isCraneEligible = !!onToggleTrack && (s.businessTrack ?? s.track) === 'CRANE';
            // A rig-only pile has no crane to choose between — it auto-runs on the
            // rig (see resolveStepExecution) whether or not the step id happens to
            // be in the explicit override list, so the tile must show Rig selected
            // either way, not just when the user manually toggled it.
            const trackChoice = isCraneEligible
              ? {
                  selected:
                    overriddenStepIds.includes(s.stepId) || !pile.craneId
                      ? ('RIG' as TrackChoice)
                      : ('CRANE' as TrackChoice),
                  onSelect: (track: TrackChoice) => onToggleTrack!(pile.checklistPileId, s.stepId, track),
                }
              : undefined;
            const isLastDisplayedStep = idx === displaySteps.length - 1;
            // A real non-working window (lunch/shift-change) the scheduler paused this step
            // for mid-way, not at a step boundary (that's breaksByIndex above) — render the
            // step as its own work segments with the break row between them instead of one
            // row whose visible span silently includes the break.
            const internalSplit =
              isPlanned && !isCompleted ? splitStepByInternalWindows(s, windowsByMachineId ?? {}) : null;
            return (
              <React.Fragment key={s.id}>
                {isPlanned && scheduledIdx !== undefined && breaksByIndex.get(scheduledIdx)?.map((b, i) => (
                  <PileBreakRow key={`break-${idx}-${i}`} label={b.label} start={b.start} end={b.end} />
                ))}
                {internalSplit ? (
                  internalSplit.segments.map((seg, segIdx) => (
                    <React.Fragment key={`${s.id}-seg-${segIdx}`}>
                      <StepTimelineRow
                        step={{
                          ...s,
                          plannedStart: seg.start,
                          plannedEnd: seg.end,
                          durationMinutes: seg.durationMinutes,
                          // seg.start is already the buffer-adjusted work-start timestamp
                          // (splitStepByInternalWindows built it from stepWorkStart(s)), so
                          // bufferMinutes must be 0 here on every segment — otherwise
                          // StepTimelineRow's own stepWorkStart(step) call re-adds the buffer
                          // on top of a start time that already includes it.
                          bufferMinutes: 0,
                        }}
                        isLast={isLastDisplayedStep && segIdx === internalSplit.segments.length - 1}
                        isPlanned={isPlanned}
                        isCompleted={false}
                        rigMachineNo={pile.rigMachineNo}
                        craneMachineNo={pile.craneMachineNo}
                        // Interactive only on the first segment — one step, not two
                        // independent ones to toggle the track of.
                        trackChoice={segIdx === 0 ? trackChoice : undefined}
                      />
                      {internalSplit.breaks[segIdx] && (
                        <PileBreakRow
                          label={internalSplit.breaks[segIdx].label}
                          start={internalSplit.breaks[segIdx].start}
                          end={internalSplit.breaks[segIdx].end}
                        />
                      )}
                    </React.Fragment>
                  ))
                ) : (
                  <StepTimelineRow
                    step={s}
                    isLast={isLastDisplayedStep}
                    isPlanned={isPlanned}
                    isCompleted={isCompleted}
                    completedStartIso={completedStartIso}
                    completedEndIso={completedEndIso}
                    rigMachineNo={pile.rigMachineNo}
                    craneMachineNo={pile.craneMachineNo}
                    trackChoice={trackChoice}
                  />
                )}
              </React.Fragment>
            );
          })
        )}
      </View>
    </View>
  );
});

interface PilesAccordionProps {
  piles: PreviewPile[];
  planSteps: PlanStepWithMeta[];
  /** Recorded actual steps, if this plan has any progress logged (PlanDetailScreen). */
  actualSteps?: ActualStepWithMeta[];
  /** Whole pending/committed track-override map, keyed by checklistPileId — Preview-only,
   * omitted on read-only screens (e.g. PlanDetailScreen) so those stay non-interactive. Only
   * each pile's own slice is threaded down to its page (see stepsByPileId/PilePreviewPage). */
  overriddenTrackStepIdsByPileId?: Record<string, string[]>;
  /** Stable across the caller's lifetime (wraps a setState) — invoked with the specific
   * pile/step/track being toggled. Omitted wherever overriddenTrackStepIdsByPileId is. */
  onToggleTrack?: (checklistPileId: string, stepId: string, track: TrackChoice) => void;
  /** Non-working windows actually applied per machine, from generatePlanPreview() — used to
   * show a break row between two steps when a real configured window falls between them. */
  windowsByMachineId?: Record<string, EffectivePlanWindow[]>;
  /** Global step catalog, in sequence order — used to compute each pile's full
   * applicable-step set so a step that didn't get scheduled still shows up,
   * faded, instead of vanishing. Omit (e.g. PlanDetailScreen) to fall back to
   * showing only the steps that actually got scheduled, same as before. */
  allSteps?: PilingStep[];
  selectedStepIds?: string[];
  resumeWorkByPileId?: Record<string, ResumeWork>;
  /** Opens the machine-reassignment panel for a pile — Preview-only, omitted on read-only
   * screens (e.g. PlanDetailScreen) so the Rig/Crane rows stay non-interactive. */
  onPressMachineBadge?: (pileId: string) => void;
}

export default function PilesAccordion({
  piles,
  planSteps,
  actualSteps = [],
  overriddenTrackStepIdsByPileId,
  onToggleTrack,
  windowsByMachineId,
  allSteps = [],
  selectedStepIds = [],
  resumeWorkByPileId = {},
  onPressMachineBadge,
}: PilesAccordionProps) {
  const [selectedPileId, setSelectedPileId] = React.useState<string | undefined>(piles[0]?.id);

  // Grouped once per real data change instead of filtering/sorting the full list inside
  // every pile page's render — keeps each pile's own slice reference-stable across renders
  // that don't touch its steps, which is what lets PilePreviewPage's React.memo actually skip
  // untouched piles.
  const stepsByPileId = React.useMemo(() => {
    const map = new Map<string, PlanStepWithMeta[]>();
    for (const s of planSteps) {
      const list = map.get(s.checklistPileId);
      if (list) list.push(s);
      else map.set(s.checklistPileId, [s]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.plannedStart).getTime() - new Date(b.plannedStart).getTime());
    }
    return map;
  }, [planSteps]);

  const actualStepsByPileId = React.useMemo(() => {
    const map = new Map<string, ActualStepWithMeta[]>();
    for (const a of actualSteps) {
      const list = map.get(a.checklistPileId);
      if (list) list.push(a);
      else map.set(a.checklistPileId, [a]);
    }
    return map;
  }, [actualSteps]);

  if (piles.length === 0) {
    return <Text style={styles.emptyText}>No piles in this plan.</Text>;
  }

  const items: SwipeableTabItem[] = piles.map((p) => ({ value: p.id, label: p.code }));
  const value = selectedPileId ?? piles[0].id;

  return (
    <Accordion
      defaultOpen
      header={
        <View style={styles.headerRow}>
          <Layers size={16} color={colors.accent} />
          <View>
            <Text style={styles.title}>Piles</Text>
            <Text style={styles.subtitle}>
              Tap a pile to view its steps.
            </Text>
          </View>
        </View>
      }
    >
      <SwipeableTabBar
        items={items}
        value={value}
        onChange={setSelectedPileId}
        scrollHint="dots"
        renderPage={(item) => {
          const pile = piles.find((p) => p.id === item.value) ?? piles[0];
          return (
            <PilePreviewPage
              pile={pile}
              steps={stepsByPileId.get(pile.checklistPileId) ?? EMPTY_STEPS}
              actualSteps={actualStepsByPileId.get(pile.checklistPileId) ?? EMPTY_ACTUAL_STEPS}
              overriddenStepIds={overriddenTrackStepIdsByPileId?.[pile.checklistPileId] ?? EMPTY_STEP_IDS}
              onToggleTrack={onToggleTrack}
              windowsByMachineId={windowsByMachineId}
              allSteps={allSteps}
              selectedStepIds={selectedStepIds}
              resumeWork={resumeWorkByPileId[pile.id]}
              onPressMachineBadge={onPressMachineBadge}
            />
          );
        }}
      />
    </Accordion>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.body, fontWeight: '800', color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  pileHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  pileHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  pileCode: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pileMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  pileDuration: {
    ...typography.body,
    fontWeight: '700',
    color: colors.accent,
  },
  pileMachinesRow: {
    flexDirection: 'column',
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
  },
  stepsContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  breakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(251,191,36,0.4)',
    backgroundColor: 'rgba(251,191,36,0.08)',
  },
  breakText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.machines.break,
  },
  noSteps: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: spacing.sm,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
