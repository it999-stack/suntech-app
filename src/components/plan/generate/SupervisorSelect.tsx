// src/components/plan/generate/SupervisorSelect.tsx

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CheckCircle2, Circle } from 'lucide-react-native';
import GlassCard from '../../shared/GlassCard';
import { colors, spacing, typography } from '../../../theme/theme';
import { AVAILABLE_SUPERVISORS } from '../../../types/plan';

interface SupervisorSelectProps {
  supervisor: string | null;
  onSelect: (name: string) => void;
}

export default function SupervisorSelect({ supervisor, onSelect }: SupervisorSelectProps) {
  return (
    <>
      <Text style={styles.sectionHint}>Who's supervising today's plan?</Text>
      {AVAILABLE_SUPERVISORS.map((name) => {
        const active = supervisor === name;
        return (
          <Pressable key={name} onPress={() => onSelect(name)}>
            <GlassCard style={styles.supervisorCard}>
              <View style={styles.supervisorRow}>
                {active ? (
                  <CheckCircle2 size={20} color={colors.accent} />
                ) : (
                  <Circle size={20} color={colors.textSecondary} />
                )}
                <Text style={[styles.supervisorName, { marginLeft: spacing.sm }]}>{name}</Text>
              </View>
            </GlassCard>
          </Pressable>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  sectionHint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  supervisorCard: { paddingVertical: spacing.sm },
  supervisorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  supervisorName: {
    ...typography.cardTitle,
    color: colors.textPrimary,
  },
});