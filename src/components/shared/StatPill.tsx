// src/components/share/StatPill

import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '@theme/theme';

interface Props {
  label: string;
  value: number;
  tone?: 'neutral' | 'success' | 'warning';
}

export default function StatPill({ label, value, tone = 'neutral' }: Props) {
  const toneColor =
    tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : colors.accent;
  const toneSoft =
    tone === 'success' ? colors.successSoft : tone === 'warning' ? colors.warningSoft : colors.accentSoft;

  return (
    <View style={[styles.pill, { backgroundColor: toneSoft }]}>
      <Text style={[styles.number, { color: toneColor }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  number: {
    ...typography.statNumber,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
