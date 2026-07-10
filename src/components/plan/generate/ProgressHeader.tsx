// src/components/plan/generate/ProgressHeader.tsx

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@/theme/theme';

export type Step =
  | 'intro'
  | 'start'
  | 'machines'
  | 'piles'
  | 'steps'
  | 'supervisors'
  | 'preview';

export const STEP_ORDER: Step[] = [
  'intro',
  'start',
  'machines',
  'piles',
  'steps',
  'supervisors',
  'preview',
];

export const STEP_LABEL: Record<Step, string> = {
  intro:       'Overview',
  start:       'Start Time',
  machines:    'Machines',
  piles:       'Piles & Assign',
  steps:       'Steps',
  supervisors: 'Supervisors',
  preview:     'Preview',
};

interface ProgressHeaderProps {
  step: Step;
  onBack: () => void;
  /** Advance to the next step. Omit or leave undefined to hide the forward button entirely. */
  onNext?: () => void;
  /** Disables the forward button (e.g. current step isn't valid yet, or currently generating). */
  nextDisabled?: boolean;
}

export default function ProgressHeader({ step, onBack, onNext, nextDisabled }: ProgressHeaderProps) {
  const idx = STEP_ORDER.indexOf(step);
  const total = STEP_ORDER.length;
  const isLastStep = idx === total - 1;

  return (
    <View style={styles.headerArea}>
      <View style={styles.headerTopRow}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.sideBtn}>
          <ChevronLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.pageTitle}>Generate Plan</Text>
        {onNext && !isLastStep ? (
          <Pressable
            onPress={onNext}
            disabled={nextDisabled}
            hitSlop={12}
            style={[styles.sideBtn, nextDisabled && styles.sideBtnDisabled]}
          >
            <ChevronRight size={22} color={nextDisabled ? colors.textSecondary : colors.textPrimary} />
          </Pressable>
        ) : (
          <View style={styles.sideBtnPlaceholder} />
        )}
      </View>
      <Text style={styles.stepLabel}>
        Step {idx + 1} of {total} · {STEP_LABEL[step]}
      </Text>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${((idx + 1) / total) * 100}%` },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideBtn: { padding: 4 },
  sideBtnDisabled: { opacity: 0.35 },
  sideBtnPlaceholder: { width: 22, padding: 4 },
  pageTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  stepLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(28,28,46,0.08)',
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
});