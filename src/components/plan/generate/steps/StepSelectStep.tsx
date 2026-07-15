// src/components/plan/generate/steps/StepSelectStep.tsx
//
// Step 6 — pick which plan steps go into today's plan. Every step shows
// directly with an inline toggle icon — no separate modal.
// Included steps show a − in a danger-red circle (tap removes them).
// Excluded steps show a faded + in an accent circle (tap adds them) — the
// whole row is dimmed so included steps read as the "active" ones at a glance.
// Pending steps required by carry-over piles are locked and cannot be removed.

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Minus, Plus, Lock } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import { getLockedStepIds } from '@/services/planPreselectService';
import type { PlanDraft } from '@/types/plan';
import type { PilingStep } from '@/db/schema';

interface StepSelectStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
  steps: PilingStep[];
}

export default function StepSelectStep({ draft, onUpdate, steps }: StepSelectStepProps) {
  const selectedSet = useMemo(
    () => new Set(draft.selectedStepIds),
    [draft.selectedStepIds],
  );

  const lockedStepIds = useMemo(
    () => getLockedStepIds(draft.selectedPileIds, draft.resumeWorkByPileId),
    [draft.selectedPileIds, draft.resumeWorkByPileId],
  );

  function toggleStep(stepId: string) {
    if (lockedStepIds.has(stepId) && selectedSet.has(stepId)) return;

    const nextIds = new Set(draft.selectedStepIds);
    if (nextIds.has(stepId)) {
      nextIds.delete(stepId);
    } else {
      nextIds.add(stepId);
    }
    const nextOrder = steps
      .filter((step) => nextIds.has(step.id))
      .map((step) => step.id);
    onUpdate({ selectedStepIds: nextOrder });
  }

  return (
    <>
      <View style={styles.section}>
        <Text style={styles.title}>Select steps</Text>
        <Text style={styles.description}>
          {lockedStepIds.size > 0
            ? "Tap a step to include or remove it from today's plan. Steps required by carry-over piles cannot be removed."
            : "Tap a step to include or remove it from today's plan."}
        </Text>
        <Text style={styles.countText}>{selectedSet.size} of {steps.length} included</Text>
      </View>

      <View style={styles.card}>
        {steps.map((step, idx) => {
          const selected = selectedSet.has(step.id);
          const locked = lockedStepIds.has(step.id) && selected;
          return (
            <Pressable
              key={step.id}
              style={[
                styles.stepRow,
                !selected && styles.stepRowMuted,
                idx === steps.length - 1 && styles.stepRowLast,
              ]}
              onPress={locked ? undefined : () => toggleStep(step.id)}
              disabled={locked}
            >
              <View style={styles.stepLabelWrap}>
                <Text style={[styles.stepName, !selected && styles.stepNameMuted]}>
                  {step.stepName}
                </Text>
                <Text style={[styles.stepMeta, !selected && styles.stepMetaMuted]}>
                  {step.track} · #{step.sequenceOrder}
                  {locked ? ' · Required for carry-over' : ''}
                </Text>
              </View>
              <View style={[
                styles.toggleWrap,
                selected && !locked && styles.toggleWrapSelected,
                !selected && styles.toggleWrapMuted,
                locked && styles.toggleWrapLocked,
              ]}>
                {locked ? (
                  <Lock size={16} color={colors.textSecondary} />
                ) : selected ? (
                  <Minus size={16} color={colors.danger} />
                ) : (
                  <Plus size={16} color={colors.textSecondary} />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.md },
  title: {
    ...typography.pageTitle,
    color: colors.textPrimary,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  countText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    ...shadow.soft,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(28,28,46,0.08)',
  },
  stepRowMuted: { opacity: 0.5 },
  stepRowLast: { borderBottomWidth: 0 },
  stepLabelWrap: { flex: 1, paddingRight: spacing.sm },
  stepName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  stepNameMuted: {
    color: colors.textSecondary,
    fontWeight: '500',
  },
  stepMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  stepMetaMuted: {},
  toggleWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  toggleWrapSelected: {
    backgroundColor: colors.dangerSoft,
  },
  toggleWrapMuted: {
    backgroundColor: 'rgba(28,28,46,0.06)',
  },
  toggleWrapLocked: {
    backgroundColor: 'rgba(28,28,46,0.06)',
  },
});
