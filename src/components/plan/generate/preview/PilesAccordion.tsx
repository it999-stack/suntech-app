// src/components/plan/generate/preview/PilesAccordion.tsx
//
// Replaces the flat per-pile accordion list. Shows one pill per pile in a
// swipeable bar (SwipeableTabBar) — tapping a pill or swiping the content
// switches which single pile's steps are shown below.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Layers } from 'lucide-react-native';
import Accordion from '@components/shared/Accordion';
import SwipeableTabBar, { type SwipeableTabItem } from '@components/shared/SwipeableTabBar';
import StepTimelineRow from './StepTimelineRow';
import { computeTotalDuration } from './previewUtils';
import type { PlanStepWithMeta } from '@repositories/planRepository';
import type { PreviewPile } from '@app-types/previewTypes';
import { colors, spacing, typography } from '@/theme/theme';
import { formatDurationMinutes } from '@/utils/formatTime';

interface PilesAccordionProps {
  piles: PreviewPile[];
  planSteps: PlanStepWithMeta[];
}

export default function PilesAccordion({ piles, planSteps }: PilesAccordionProps) {
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
          const steps = planSteps.filter((s) => s.checklistPileId === pile.checklistPileId);
          const totalDuration = formatDurationMinutes(computeTotalDuration(steps));

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
                    Rig {pile.rigMachineNo} · Crane {pile.craneMachineNo}
                  </Text>
                </View>
              </View>

              <View style={styles.stepsContainer}>
                {steps.length === 0 ? (
                  <Text style={styles.noSteps}>No plan steps generated for this pile.</Text>
                ) : (
                  steps.map((s, idx) => (
                    <StepTimelineRow key={s.id} step={s} isLast={idx === steps.length - 1} />
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
