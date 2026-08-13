// src/components/plan/generate/ProgressHeader.tsx

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@/theme/theme';

export type Step =
  | 'location'
  | 'start'
  | 'machines'
  | 'team'
  | 'piles'
  | 'resume'
  | 'steps'
  | 'preview';

export const STEP_ORDER: Step[] = [
  'start',
  'location',
  'machines',
  'team',
  'piles',
  'resume',
  'steps',
  'preview',
];

export const STEP_LABEL: Record<Step, string> = {
  location: 'Location & Piles',
  start: 'Start Time',
  machines: 'Machines',
  team: 'Team',
  piles: 'Piles & Assign',
  resume: 'Planned Piles',
  steps: 'Steps',
  preview: 'Preview',
};

interface ProgressHeaderProps {
  step: Step;
  onClose: () => void;
  onBack: () => void;
  backDisabled?: boolean;
  onNext?: () => void;
  nextDisabled?: boolean;
}

export default function ProgressHeader({
  step,
  onClose,
  onBack,
  backDisabled,
  onNext,
  nextDisabled,
}: ProgressHeaderProps) {
  const idx = STEP_ORDER.indexOf(step);
  const total = STEP_ORDER.length;
  const isLastStep = idx === total - 1;
  const nextInactive = !onNext || nextDisabled;

  return (
    <View style={styles.headerArea}>
      <View style={styles.card}>
        <View style={styles.topRow}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={styles.closeBtn}
          >
            <X size={18} color={colors.textPrimary} />
          </Pressable>

          <Text
            style={styles.titleText}
            numberOfLines={1}
          >
            {STEP_LABEL[step]}
          </Text>

          <View style={styles.chevronGroup}>
            <Pressable
              onPress={onBack}
              disabled={backDisabled}
              hitSlop={8}
              style={[
                styles.chevronBtn,
                backDisabled && styles.chevronBtnDisabled,
              ]}
            >
              <ChevronLeft
                size={18}
                color={
                  backDisabled
                    ? colors.textSecondary
                    : colors.textPrimary
                }
              />
            </Pressable>

            {!isLastStep ? (
              <Pressable
                onPress={onNext}
                disabled={nextInactive}
                hitSlop={8}
                style={[
                  styles.chevronBtn,
                  nextInactive && styles.chevronBtnDisabled,
                ]}
              >
                <ChevronRight
                  size={18}
                  color={
                    nextInactive
                      ? colors.textSecondary
                      : colors.textPrimary
                  }
                />
              </Pressable>
            ) : (
              <View style={styles.chevronBtnPlaceholder} />
            )}
          </View>
        </View>

        {/* Progress */}
        <View style={styles.progressSection}>
          <Text style={styles.stepCaption}>
            {idx + 1}/{total} • {STEP_LABEL[step]}
          </Text>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${((idx + 1) / total) * 100}%`,
                },
              ]}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerArea: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs
  },

  card: {
    padding: spacing.md,
    paddingVertical: spacing.xs,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  titleText: {
    flex: 1,
    textAlign: 'center',
    ...typography.h2,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  chevronGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  chevronBtn: {
    padding: 4,
  },

  chevronBtnDisabled: {
    opacity: 0.35,
  },

  chevronBtnPlaceholder: {
    width: 22,
    padding: 4,
  },

  progressSection: {
    marginTop: spacing.md,
  },

  stepCaption: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },

  progressTrack: {
    width: '100%',
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(28,28,46,0.10)',
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
});