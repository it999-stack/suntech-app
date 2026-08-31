// src/components/plan/generate/NextStepFab.tsx
//
// Floating "go to next step" chevron. GeneratePlanScreen renders this
// itself for every step except Piles and Preview — Piles is the one step
// that swaps it out for BulkAssignBar based on local checkbox-selection
// state the parent can't see, so PileAssignStep renders its own copy
// instead (with a `style` override to cancel pilesStepContainer's own
// padding — see its call site). Preview's button is a real submit action,
// not a "next step" nav, so it keeps its own full-width bar.
//
// Thin wrapper around the shared RoundedButton (the app's circular-FAB
// pattern) — kept as its own component so call sites don't need to know
// which icon/defaults this particular FAB uses.

import { type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import RoundedButton from '@components/shared/RoundedButton';

interface NextStepFabProps {
  onPress: () => void;
  disabled?: boolean;
  /** Swaps the chevron for a spinner — e.g. StepSelectStep's Continue tap
   * precomputes the plan preview before actually navigating, so this is
   * what assures the user their tap registered. */
  loading?: boolean;
  /**
   * Overrides the default `right`/`bottom` offset — needed by any caller
   * whose containing view already has its own horizontal padding (e.g.
   * PileAssignStep, wrapped in GeneratePlanScreen's `pilesStepContainer`),
   * so the FAB doesn't end up inset twice and land closer to center than
   * every other step's copy of this same button.
   */
  style?: StyleProp<ViewStyle>;
}

export default function NextStepFab({ onPress, disabled, loading, style }: NextStepFabProps) {
  return <RoundedButton icon={ChevronRight} onPress={onPress} disabled={disabled} loading={loading} style={style} />;
}
