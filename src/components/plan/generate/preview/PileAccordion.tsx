// src/components/plan/generate/preview/PileAccordion.tsx
//
// Per-pile accordion for the preview step. Uses the shared Accordion shell.
// Header shows pile code, dimensions, total duration, and machine assignments.
// Body lists each planned step with track badge, times, and duration.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Accordion from '@components/shared/Accordion';
import StepTimelineRow from './StepTimelineRow';
import { fmtDuration } from '@/types/plan';
import type { PlanStepWithMeta } from '@repositories/planRepository';
import type { PreviewPile } from '@app-types/previewTypes';
import { colors, spacing, typography } from '@/theme/theme';
import { formatDurationMinutes } from '@/utils/formatTime';

interface PileAccordionProps {
  pile: PreviewPile;
  steps: PlanStepWithMeta[];
}

export default function PileAccordion({ pile, steps }: PileAccordionProps) {
  // Sum pure working minutes stored by the planner (excludes break time).

  const totalMin = steps.reduce((sum, s) => {
    if (!s.plannedStart || !s.plannedEnd) return sum;

    return (
      sum +
      (new Date(s.plannedEnd).getTime() -
        new Date(s.plannedStart).getTime()) /
        60000
    );
  }, 0);

  const totalDuration = formatDurationMinutes(totalMin);

  return (
    <Accordion
      header={
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.accordionCode}>{pile.code}</Text>
            <Text style={styles.accordionMeta}>
              {pile.dia}mm · {pile.depth}m
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.accordionDuration}>{totalDuration}</Text>
            <Text style={styles.accordionMachines}>
              Rig {pile.rigMachineNo} · Crane {pile.craneMachineNo}
            </Text>
          </View>
        </View>
      }
    >
      <View style={styles.stepsContainer}>
        {steps.length === 0 ? (
          <Text style={styles.noSteps}>No plan steps generated for this pile.</Text>
        ) : (
          steps.map((s, idx) => (
            <StepTimelineRow key={s.id} step={s} isLast={idx === steps.length - 1} />
          ))
        )}
      </View>
    </Accordion>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerLeft: { flex: 1 },
  accordionCode: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  accordionMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerRight: { alignItems: 'flex-end' },
  accordionDuration: {
    ...typography.body,
    fontWeight: '700',
    color: colors.accent,
  },
  accordionMachines: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  stepsContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  noSteps: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: spacing.sm,
  },
});