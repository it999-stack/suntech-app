// src/components/piles/PileAccordionItem.tsx
//
// Renders a pile as an expandable accordion card. Uses the shared Accordion
// shell for expand/collapse. Header shows pile code, dimensions, status badge,
// and assigned machines. Body shows a timeline of steps.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Cpu, Truck } from 'lucide-react-native';
import { formatTimeRange } from '../../utils/formatTime';
import Accordion from '../shared/Accordion';
import GlassCard from '../shared/GlassCard';
import { colors, spacing, radius, typography } from '../../theme/theme';

export type Track = 'RIG' | 'CRANE';
export type StepStatus = 'done' | 'upcoming';

export type PlanStep = {
  id: string;
  name: string;
  track: Track;
  start: string;
  end: string;
  status: StepStatus;
};

export type PileItemData = {
  id: string;
  code: string;
  dia: number;
  depth: number;
  rig: string;
  crane: string;
  status: 'pending' | 'in_progress' | 'completed';
  steps: PlanStep[];
};

function statusConfig(status: PileItemData['status']) {
  if (status === 'completed') return { bg: colors.successSoft, fg: colors.success, label: 'Completed' };
  if (status === 'in_progress') return { bg: colors.accentSoft, fg: colors.accent, label: 'In Progress' };
  return { bg: colors.warningSoft, fg: colors.warning, label: 'Pending' };
}

interface Props {
  pile: PileItemData;
}

export default function PileAccordionItem({ pile }: Props) {
  const st = statusConfig(pile.status);
  const hasMachines = pile.rig !== '—' || pile.crane !== '—';

  return (
    <Accordion
      header={
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.code}>{pile.code}</Text>
            <Text style={styles.dims}>{pile.dia} mm × {pile.depth} m</Text>
            {hasMachines && (
              <View style={styles.headerMachineRow}>
                {pile.rig !== '—' && (
                  <View style={styles.headerMachinePill}>
                    <Cpu size={10} color={colors.accent} strokeWidth={2} />
                    <Text style={styles.headerMachinePillText}>{pile.rig}</Text>
                  </View>
                )}
                {pile.crane !== '—' && (
                  <View style={styles.headerMachinePill}>
                    <Truck size={10} color={colors.warning} strokeWidth={2} />
                    <Text style={styles.headerMachinePillText}>{pile.crane}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
              <Text style={[styles.statusText, { color: st.fg }]}>{st.label}</Text>
            </View>
          </View>
        </View>
      }
    >
      {/* Timeline */}
      <View style={styles.timeline}>
        {pile.steps.length === 0 ? (
          <Text style={styles.noStepsText}>No steps planned for this pile today.</Text>
        ) : (
          pile.steps.map((step, idx) => {
            const isLast = idx === pile.steps.length - 1;
            return (
              <View key={step.id} style={[styles.stepRow, !isLast && styles.stepRowDivider]}>
                <View style={styles.stepHeader}>
                  <Text style={styles.stepName}>{step.name}</Text>
                  <View
                    style={[
                      styles.trackBadge,
                      { backgroundColor: step.track === 'RIG' ? colors.accentSoft : 'rgba(255,149,0,0.12)' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.trackText,
                        { color: step.track === 'RIG' ? colors.accent : colors.warning },
                      ]}
                    >
                      {step.track}
                    </Text>
                  </View>
                </View>
                <Text style={styles.stepTime}>{formatTimeRange(step.start, step.end)}</Text>
              </View>
            );
          })
        )}
      </View>
    </Accordion>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  headerLeft: {
    gap: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  code: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  dims: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '700',
  },

  // Header machine pills (shown in collapsed header)
  headerMachineRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: 3,
  },
  headerMachinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(28,28,46,0.06)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  headerMachinePillText: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  // Timeline
  timeline: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: 0,
  },
  noStepsText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  stepRow: {
    paddingVertical: spacing.sm,
  },
  stepRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(28,28,46,0.06)',
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepName: {
    ...typography.cardTitle,
    color: colors.textPrimary,
  },
  trackBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  trackText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  stepTime: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  loggedText: {
    ...typography.caption,
    color: colors.success,
    marginTop: 2,
  },
});