// src/components/plan/generate/preview/PlanWindowBar.tsx

import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '@/theme/theme';

interface PlanWindowBarProps {
  startLabel: string;
  endLabel: string;
  show?: boolean;
}

export default function PlanWindowBar({
  startLabel,
  endLabel,
  show = false,
}: PlanWindowBarProps) {
  return (
    <View style={styles.wrap}>
      {show && (
        <View style={styles.barRow}>
          <View style={styles.dot} />
          <View style={styles.line} />
          <View style={styles.dot} />
        </View>
      )}

      <View style={styles.labelsRow}>
        <Text style={styles.label}>{startLabel}</Text>
        <Text style={styles.label}>{endLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(20,20,31,0.15)',
    marginHorizontal: spacing.xs,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  label: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textSecondary,
  },
});