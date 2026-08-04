// src/components/plan/generate/steps/StepSelectStep.tsx
//
// Step 6 — pick which plan steps go into today's plan. Every step shows as
// a glass card (matching the Piling Steps settings screen) with its track
// badge and the dia/depth × duration rows relevant to this plan's piles.
// Tapping a card toggles it — included steps show a − in a danger-red
// circle, excluded steps show a faded + in an accent circle and the whole
// card is dimmed. Pending steps required by carry-over piles are locked
// and cannot be removed.

import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Minus, Plus, Lock } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import GlassCard from '@components/shared/GlassCard';
import { getLockedStepIds } from '@/services/planPreselectService';
import { TRACK_META } from '@/utils/trackMeta';
import { formatDurationLong } from '@/utils/formatTime';
import type { PlanDraft } from '@/types/plan';
import type { PilingStep } from '@/db/schema';
import type { PileWithDimension } from '@repositories/pilesRepository';
import type { PlanTemplateRow } from '@/services/pilingPlannerService';

interface StepSelectStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
  steps: PilingStep[];
  planPiles: PileWithDimension[];
  templateRows: PlanTemplateRow[];
}

export default function StepSelectStep({ draft, onUpdate, steps, planPiles, templateRows }: StepSelectStepProps) {
  const selectedSet = useMemo(
    () => new Set(draft.selectedStepIds),
    [draft.selectedStepIds],
  );

  const lockedStepIds = useMemo(
    () => getLockedStepIds(draft.selectedPileIds, draft.resumeWorkByPileId),
    [draft.selectedPileIds, draft.resumeWorkByPileId],
  );

  const dimsById = useMemo(
    () => new Map(planPiles.map((p) => [p.dimensionId, { dia: p.dia, depth: p.depth }])),
    [planPiles],
  );

  const templatesByStepId = useMemo(() => {
    const map = new Map<string, PlanTemplateRow[]>();
    for (const t of templateRows) {
      const list = map.get(t.stepId);
      if (list) list.push(t);
      else map.set(t.stepId, [t]);
    }
    return map;
  }, [templateRows]);

  function relevantTemplatesForStep(stepId: string): (PlanTemplateRow & { dia: number; depth: number })[] {
    return (templatesByStepId.get(stepId) ?? [])
      .flatMap((t) => {
        const dim = dimsById.get(t.dimensionId);
        return dim ? [{ ...t, dia: dim.dia, depth: dim.depth }] : [];
      })
      .sort((a, b) => a.dia - b.dia || a.depth - b.depth);
  }

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

      <View style={styles.list}>
        {steps.map((step) => {
          const selected = selectedSet.has(step.id);
          const locked = lockedStepIds.has(step.id) && selected;
          const meta = TRACK_META[step.track as keyof typeof TRACK_META] ?? TRACK_META.RIG;
          const Icon = meta.icon;
          const relevant = relevantTemplatesForStep(step.id);

          return (
            <Pressable
              key={step.id}
              onPress={locked ? undefined : () => toggleStep(step.id)}
              disabled={locked}
              style={!selected && styles.cardMuted}
            >
              <GlassCard innerStyle={styles.card}>
                <View style={styles.headerRow}>
                  <View style={[styles.numBadge, { backgroundColor: meta.color }]}>
                    <Text style={styles.numText}>{step.sequenceOrder}</Text>
                  </View>
                  <Text style={styles.stepName} numberOfLines={1}>
                    {step.stepName}
                  </Text>
                  <View style={[styles.trackBadge, { backgroundColor: meta.soft }]}>
                    <Icon color={meta.color} size={10} strokeWidth={2} />
                    <Text style={[styles.trackText, { color: meta.color }]}>{meta.label}</Text>
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
                </View>

                {locked && <Text style={styles.lockedNote}>Required for carry-over</Text>}

                <View style={styles.templateList}>
                  {relevant.length === 0 ? (
                    <Text style={styles.emptyTemplateText}>No duration data for this plan's pile sizes.</Text>
                  ) : (
                    relevant.map((t, idx) => (
                      <View
                        key={t.id}
                        style={[styles.templateRow, idx !== relevant.length - 1 && styles.templateRowDivider]}
                      >
                        <Text style={styles.templateDims}>
                          Ø{t.dia}mm × {t.depth}m
                        </Text>
                        <Text style={styles.templateTime}>
                          {formatDurationLong(t.durationMinutes)}
                          {t.bufferBeforeMinutes > 0 && ` (+${t.bufferBeforeMinutes} buffer)`}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </GlassCard>
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
  list: { gap: spacing.md },
  cardMuted: { opacity: 0.5 },
  card: {
    padding: spacing.md,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  numBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  stepName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  trackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    flexShrink: 0,
  },
  trackText: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
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
  lockedNote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    marginLeft: 40,
  },
  templateList: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,28,46,0.08)',
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
  },
  templateRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(28,28,46,0.06)',
  },
  templateDims: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  templateTime: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  emptyTemplateText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingVertical: spacing.xs,
  },
});
