// src/components/plan/generate/preview/PilesAccordion.tsx
//
// Replaces the flat per-pile accordion list. Shows one pill per pile in a
// swipeable bar (SwipeableTabBar) — tapping a pill or swiping the content
// switches which single pile's steps are shown below.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Layers, Coffee } from 'lucide-react-native';
import Accordion from '@components/shared/Accordion';
import SwipeableTabBar, { type SwipeableTabItem } from '@components/shared/SwipeableTabBar';
import StepTimelineRow from './StepTimelineRow';
import type { TrackChoice } from './TrackChoiceTiles';
import { computeTotalDuration, computeMachineOccupancyMinutes, computePileStepBreaks } from './previewUtils';
import type { PlanStepWithMeta, ActualStepWithMeta } from '@repositories/planRepository';
import type { PreviewPile } from '@app-types/previewTypes';
import type { EffectivePlanWindow } from '@/services/pilingPlannerService';
import { colors, spacing, typography, radius } from '@/theme/theme';
import { formatDurationMinutes, formatTime } from '@/utils/formatTime';

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

interface PilesAccordionProps {
  piles: PreviewPile[];
  planSteps: PlanStepWithMeta[];
  /** Recorded actual steps, if this plan has any progress logged (PlanDetailScreen). */
  actualSteps?: ActualStepWithMeta[];
  /** When provided, CRANE-track steps become tappable Rig/Crane choice tiles — Preview-only,
   * omitted on read-only screens (e.g. PlanDetailScreen) so those stay non-interactive. */
  getTrackChoice?: (
    pile: PreviewPile,
    step: PlanStepWithMeta,
  ) => { selected: TrackChoice; onSelect: (track: TrackChoice) => void };
  /** Non-working windows actually applied per machine, from generatePlanPreview() — used to
   * show a break row between two steps when a real configured window falls between them. */
  windowsByMachineId?: Record<string, EffectivePlanWindow[]>;
}

export default function PilesAccordion({
  piles,
  planSteps,
  actualSteps = [],
  getTrackChoice,
  windowsByMachineId,
}: PilesAccordionProps) {
  const [selectedPileId, setSelectedPileId] = React.useState<string | undefined>(piles[0]?.id);

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
              {piles.length} pile{piles.length === 1 ? '' : 's'} in plan
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
          const steps = planSteps
            .filter((s) => s.checklistPileId === pile.checklistPileId)
            .sort((a, b) => new Date(a.plannedStart).getTime() - new Date(b.plannedStart).getTime());
          const totalDuration = formatDurationMinutes(computeTotalDuration(steps));
          // Occupancy is derived from the CONFIRMED schedule (planSteps) only — a pending,
          // not-yet-confirmed tile selection never affects this, same as the step times below.
          const rigOccupancy = formatDurationMinutes(computeMachineOccupancyMinutes(steps, pile.rigId));
          const craneOccupancy = formatDurationMinutes(computeMachineOccupancyMinutes(steps, pile.craneId));
          const actualByStepId = new Map(
            actualSteps
              .filter((a) => a.checklistPileId === pile.checklistPileId)
              .map((a) => [a.stepId, a]),
          );
          const breaksByIndex = new Map<number, ReturnType<typeof computePileStepBreaks>>();
          for (const b of computePileStepBreaks(steps, windowsByMachineId ?? {})) {
            const list = breaksByIndex.get(b.beforeIndex);
            if (list) list.push(b);
            else breaksByIndex.set(b.beforeIndex, [b]);
          }

          return (
            <View>
              <View style={styles.pileHeaderRow}>
                <View style={styles.pileHeaderLeft}>
                  <Text style={styles.pileCode}>{pile.code}</Text>
                  <Text style={styles.pileMeta}>
                    {pile.dia}mm · {pile.depth}m
                  </Text>
                </View>
                <View style={styles.pileHeaderRight}>
                  <Text style={styles.pileDuration}>{totalDuration}</Text>
                  <Text style={styles.pileMachines}>
                    Rig {rigOccupancy} · Crane {craneOccupancy}
                  </Text>
                </View>
              </View>

              <View style={styles.stepsContainer}>
                {steps.length === 0 ? (
                  <Text style={styles.noSteps}>No plan steps generated for this pile.</Text>
                ) : (
                  steps.map((s, idx) => (
                    <React.Fragment key={s.id}>
                      {breaksByIndex.get(idx)?.map((b, i) => (
                        <PileBreakRow key={`break-${idx}-${i}`} label={b.label} start={b.start} end={b.end} />
                      ))}
                      <StepTimelineRow
                        step={s}
                        isLast={idx === steps.length - 1}
                        isCompleted={!!actualByStepId.get(s.stepId)?.actualEnd}
                        rigMachineNo={pile.rigMachineNo}
                        craneMachineNo={pile.craneMachineNo}
                        trackChoice={
                          // Eligibility is the step's nominal (business) track, not the
                          // currently-displayed one — once overridden, `s.track` reads
                          // as 'RIG', but the tiles must stay offered so it can be
                          // toggled back. Falls back to `s.track` where businessTrack
                          // isn't populated (persisted rows never set it, and never
                          // pass getTrackChoice anyway).
                          getTrackChoice && (s.businessTrack ?? s.track) === 'CRANE'
                            ? getTrackChoice(pile, s)
                            : undefined
                        }
                      />
                    </React.Fragment>
                  ))
                )}
              </View>
            </View>
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
  pileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  pileHeaderLeft: { flex: 1 },
  pileCode: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pileMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pileHeaderRight: { alignItems: 'flex-end' },
  pileDuration: {
    ...typography.body,
    fontWeight: '700',
    color: colors.accent,
  },
  pileMachines: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
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
