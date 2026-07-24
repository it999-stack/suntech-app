// src/components/plan/generate/preview/MachineTimelineAccordion.tsx
//
// Replaces PlanTimelineBar.tsx. Same inputs (plan steps + active machines),
// but instead of one proportional bar per machine, it shows a single
// selected machine's "stop log" at a time — a vertical list of what it did,
// where, and when — via the shared Accordion + MachineStopTimeline.
//
// This file is the only plan-specific piece: it knows about PlanStepWithMeta
// and pile IDs. The actual timeline UI (MachineStopTimeline) and the stop-log
// logic (buildMachineStops) are generic and reusable elsewhere.

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Clock } from 'lucide-react-native';
import Accordion from '@components/shared/Accordion';
import MachineStopTimeline from '@components/shared/timeline/MachineStopTimeline';
import { buildMachineStops } from '@/utils/timeline';
import { type MachineInfo, type TimelineSourceItem, type TimelineStop } from '@/types/timeline';
import { colors, spacing, typography } from '@/theme/theme';
import type { PlanStepWithMeta } from '@repositories/planRepository';
import { isContinuingStep } from '@utils/helpers';

export type { MachineInfo };

interface MachineTimelineAccordionProps {
  windowStart: Date;
  windowEnd: Date;
  steps: PlanStepWithMeta[];
  /** All active rig machines for this plan. */
  activeRigs: MachineInfo[];
  /** All active crane machines for this plan. */
  activeCranes: MachineInfo[];
  /**
   * checklistPileId -> display label, e.g. "Pile P-04".
   * Built by the caller (see PreviewStep) since only it knows the real
   * field name for a pile's code on `PreviewPile`.
   */
  pileLabelById: Record<string, string>;
}

export default function MachineTimelineAccordion({
  windowStart,
  windowEnd,
  steps,
  activeRigs,
  activeCranes,
  pileLabelById,
}: MachineTimelineAccordionProps) {
  const machines = useMemo<MachineInfo[]>(() => [...activeRigs, ...activeCranes], [activeRigs, activeCranes]);
  const [selectedMachineId, setSelectedMachineId] = useState<string | undefined>(machines[0]?.id);

  const sourceItems: TimelineSourceItem[] = useMemo(
    () =>
      steps
        .filter((s) => s.assignedMachineId && s.plannedStart)
        .map((s) => ({
          machineId: s.assignedMachineId,
          start: s.plannedStart,
          // A continuing step has no committed end — fill the bar to the
          // window boundary instead of letting it vanish from the timeline.
          end: isContinuingStep(s) ? windowEnd.toISOString() : s.plannedEnd,
          groupKey: s.checklistPileId ?? s.id,
          groupLabel: s.checklistPileId ? pileLabelById[s.checklistPileId] ?? 'Unassigned pile' : 'Unassigned pile',
          detailLabel: s.stepName,
        })),
    [steps, pileLabelById],
  );

  const stopsByMachineId = useMemo(() => {
    const map: Record<string, TimelineStop[]> = {};
    machines.forEach((m) => {
      map[m.id] = buildMachineStops({
        items: sourceItems,
        machineId: m.id,
        windowStart,
        windowEnd,
      });
    });
    return map;
  }, [machines, sourceItems, windowStart, windowEnd]);

  if (machines.length === 0) return null;

  return (
    <Accordion
      defaultOpen
      header={
        <View style={styles.headerRow}>
          <Clock size={16} color={colors.accent} />
          <View>
            <Text style={styles.title}>Machine Timeline</Text>
            <Text style={styles.subtitle}>
              {activeRigs.length} rig{activeRigs.length === 1 ? '' : 's'} · {activeCranes.length} crane
              {activeCranes.length === 1 ? '' : 's'} active
            </Text>
          </View>
        </View>
      }
    >
      <MachineStopTimeline
        machines={machines}
        stopsByMachineId={stopsByMachineId}
        selectedMachineId={selectedMachineId}
        onSelectMachine={setSelectedMachineId}
      />
    </Accordion>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.body, fontWeight: '800', color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
});