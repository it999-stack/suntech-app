// src/components/plan/generate/StartTimePicker.tsx

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import TimeStepper from '../../shared/TimeStepper';
import { colors, spacing, typography } from '../../../theme/theme';

interface StartTimePickerProps {
  startTime: number;
  onChange: (minutes: number) => void;
}

export default function StartTimePicker({ startTime, onChange }: StartTimePickerProps) {
  return (
    <>
      <Text style={styles.sectionHint}>
        This sets the anchor start time for the 24-hour plan.
      </Text>
      <TimeStepper minutes={startTime} onChange={onChange} step={30} />
    </>
  );
}

const styles = StyleSheet.create({
  sectionHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
});