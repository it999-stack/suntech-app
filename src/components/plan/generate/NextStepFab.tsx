// src/components/plan/generate/NextStepFab.tsx
//
// Floating "go to next step" chevron. GeneratePlanScreen renders this
// itself for every step except Piles and Preview — Piles is the one step
// that swaps it out for BulkAssignBar based on local checkbox-selection
// state the parent can't see, so PileAssignStep renders its own copy
// instead (with a `style` override to cancel pilesStepContainer's own
// padding — see its call site). Preview's button is a real submit action,
// not a "next step" nav, so it keeps its own full-width bar.

import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { colors, spacing, shadow } from '@theme/theme';

interface NextStepFabProps {
  onPress: () => void;
  disabled?: boolean;
  /**
   * Overrides the default `right`/`bottom` offset — needed by any caller
   * whose containing view already has its own horizontal padding (e.g.
   * PileAssignStep, wrapped in GeneratePlanScreen's `pilesStepContainer`),
   * so the FAB doesn't end up inset twice and land closer to center than
   * every other step's copy of this same button.
   */
  style?: StyleProp<ViewStyle>;
}

export default function NextStepFab({ onPress, disabled, style }: NextStepFabProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        style,
        disabled && styles.fabDisabled,
        pressed && !disabled && styles.fabPressed,
      ]}
    >
      <ChevronRight size={26} color={colors.white} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.soft,
    zIndex: 10,
  },
  fabDisabled: { opacity: 0.4 },
  fabPressed: { opacity: 0.85 },
});
