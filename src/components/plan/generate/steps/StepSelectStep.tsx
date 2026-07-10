import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Check, Plus, Trash2 } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import { colors, spacing, radius, typography, shadow } from '@/theme/theme';
import type { PlanDraft } from '@/types/plan';
import type { PilingStep } from '@/db/schema';

interface StepSelectStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
  steps: PilingStep[];
}

export default function StepSelectStep({ draft, onUpdate, steps }: StepSelectStepProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const selectedSteps = useMemo(
    () => steps.filter((step) => draft.selectedStepIds.includes(step.id)),
    [steps, draft.selectedStepIds],
  );

  const selectedSet = useMemo(
    () => new Set(draft.selectedStepIds),
    [draft.selectedStepIds],
  );

  function updateSelection(stepId: string, selected: boolean) {
    const nextIds = new Set(draft.selectedStepIds);
    if (selected) {
      nextIds.add(stepId);
    } else {
      nextIds.delete(stepId);
    }
    const nextOrder = steps
      .filter((step) => nextIds.has(step.id))
      .map((step) => step.id);
    onUpdate({ selectedStepIds: nextOrder });
  }

  return (
    <>
      <View style={styles.section}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Select Steps</Text>
          <Pressable style={styles.addButton} onPress={() => setModalOpen(true)}>
            <Plus size={16} color={colors.white} />
            <Text style={styles.addLabel}>Add / Remove</Text>
          </Pressable>
        </View>
        <Text style={styles.description}>
          Choose which pile plan steps should be included in today’s generated plan.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Included steps ({selectedSteps.length})</Text>
        {selectedSteps.length === 0 ? (
          <Text style={styles.emptyText}>No steps selected yet. Tap Add / Remove to choose steps.</Text>
        ) : (
          selectedSteps.map((step) => (
            <View key={step.id} style={styles.stepRow}>
              <View style={styles.stepLabelWrap}>
                <Text style={styles.stepName}>{step.stepName}</Text>
                <Text style={styles.stepMeta}>{step.track} · #{step.sequenceOrder}</Text>
              </View>
              <Pressable
                style={styles.removeBtn}
                onPress={() => updateSelection(step.id, false)}
                hitSlop={8}
              >
                <Trash2 size={16} color={colors.danger} />
              </Pressable>
            </View>
          ))
        )}
      </View>

      <AppModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Pick plan steps"
        subtitle="Tap a step to include or remove it from today’s plan."
      >
        <View style={styles.modalBody}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {steps.map((step) => {
              const selected = selectedSet.has(step.id);
              return (
                <Pressable
                  key={step.id}
                  style={[styles.modalRow, selected && styles.modalRowSelected]}
                  onPress={() => updateSelection(step.id, !selected)}
                >
                  <View>
                    <Text style={styles.modalStepName}>{step.stepName}</Text>
                    <Text style={styles.modalStepMeta}>{step.track} · #{step.sequenceOrder}</Text>
                  </View>
                  <View style={styles.iconWrap}>
                    {selected ? (
                      <Check size={16} color={colors.white} />
                    ) : (
                      <Plus size={16} color={colors.accent} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable style={styles.doneButton} onPress={() => setModalOpen(false)}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </AppModal>
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.md },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    ...typography.pageTitle,
    color: colors.textPrimary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  addLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.white,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.soft,
  },
  sectionTitle: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(28,28,46,0.08)',
  },
  stepLabelWrap: { flex: 1, paddingRight: spacing.sm },
  stepName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  stepMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  modalBody: { paddingBottom: spacing.xxl },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(28,28,46,0.08)',
  },
  modalRowSelected: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
  },
  modalStepName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  modalStepMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(236, 72, 153, 0.12)',
  },
  doneButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  doneText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.white,
  },
});
