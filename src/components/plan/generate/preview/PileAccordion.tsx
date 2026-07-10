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
import type { PreviewPile } from './previewTypes';
import { colors, spacing, typography } from '@/theme/theme';

interface PileAccordionProps {
  pile: PreviewPile;
  steps: PlanStepWithMeta[];
}

export default function PileAccordion({ pile, steps }: PileAccordionProps) {
  // Sum pure working minutes stored by the planner (excludes break time).
  // Fall back to wall-clock diff only for legacy rows that pre-date this field.
  const totalDuration = (() => {
    if (steps.length === 0) return '—';
    const allHaveDuration = steps.every((s) => s.durationMinutes != null);
    if (allHaveDuration) {
      const totalMin = steps.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      if (h === 0) return `${m}m`;
      if (m === 0) return `${h}h`;
      return `${h}h ${m}m`;
    }
    // Legacy fallback: wall-clock span from first start to last end
    const firstStart = steps[0]?.plannedStart ?? null;
    const lastEnd = steps[steps.length - 1]?.plannedEnd ?? null;
    return firstStart && lastEnd ? fmtDuration(firstStart, lastEnd) : '—';
  })();

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