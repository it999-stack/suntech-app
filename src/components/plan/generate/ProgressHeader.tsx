// src/components/plan/generate/ProgressHeader.tsx

import { View, Text, StyleSheet } from 'react-native';
import { ChevronLeft, X } from 'lucide-react-native';
import RoundedButton from '@components/shared/RoundedButton';
import { colors, spacing, typography } from '@/theme/theme';

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
          <RoundedButton
            icon={ChevronLeft}
            variant="secondary"
            floating={false}
            size={TAP_TARGET}
            iconSize={22}
            onPress={onBack}
            disabled={backDisabled}
          />

          <Text
            style={styles.titleText}
            numberOfLines={1}
          >
            {STEP_LABEL[step]}
          </Text>

          <RoundedButton
            icon={X}
            variant="secondary"
            floating={false}
            size={TAP_TARGET}
            iconSize={20}
            onPress={onClose}
          />
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

  titleText: {
    flex: 1,
    textAlign: 'center',
    ...typography.h2,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: spacing.xs,
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