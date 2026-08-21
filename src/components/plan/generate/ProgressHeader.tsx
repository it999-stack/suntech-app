// src/components/plan/generate/ProgressHeader.tsx

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ChevronLeft, X } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@/theme/theme';

export type Step =
  | 'location'
  | 'start'
  | 'machines'
  | 'team'
  | 'teamNight'
  | 'piles'
  | 'resume'
  | 'steps'
  | 'preview';

export const STEP_ORDER: Step[] = [
  'start',
  'location',
  'machines',
  'team',
  'teamNight',
  'piles',
  'resume',
  'steps',
  'preview',
];

export const STEP_LABEL: Record<Step, string> = {
  location: 'Location & Piles',
  start: 'Start Time',
  machines: 'Machines',
  team: 'Team (Day)',
  teamNight: 'Team (Night)',
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
}

const TAP_TARGET = 44;

export default function ProgressHeader({
  step,
  onClose,
  onBack,
  backDisabled,
}: ProgressHeaderProps) {
  const idx = STEP_ORDER.indexOf(step);
  const total = STEP_ORDER.length;

  return (
    <View style={styles.headerArea}>
      <View style={styles.card}>
        <View style={styles.topRow}>
          <Pressable
            onPress={onBack}
            disabled={backDisabled}
            hitSlop={4}
            style={({ pressed }) => [
              styles.chevronBtn,
              backDisabled && styles.chevronBtnDisabled,
              pressed && !backDisabled && styles.btnPressed,
            ]}
          >
            <ChevronLeft
              size={22}
              color={
                backDisabled
                  ? colors.textSecondary
                  : colors.textPrimary
              }
            />
          </Pressable>

          <Text
            style={styles.titleText}
            numberOfLines={1}
          >
            {STEP_LABEL[step]}
          </Text>

          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && styles.btnPressed,
            ]}
          >
            <X size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* Progress */}
        <View style={styles.progressSection}>

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
    paddingHorizontal: spacing.xs,
    marginTop: spacing.xs,
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
    width: TAP_TARGET,
    height: TAP_TARGET,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  titleText: {
    flex: 1,
    textAlign: 'center',
    ...typography.h2,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: spacing.xs,
  },

  chevronBtn: {
    width: TAP_TARGET,
    height: TAP_TARGET,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,28,46,0.05)',
  },

  chevronBtnDisabled: {
    opacity: 0.35,
    backgroundColor: 'transparent',
  },

  btnPressed: {
    backgroundColor: 'rgba(28,28,46,0.10)',
  },

  progressSection: {
    marginTop: spacing.sm,
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