// src/components/plan/generate/steps/IntroStep.tsx
// Static intro card explaining the 24-hour plan wizard.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Info } from 'lucide-react-native';

import GlassCard from '@components/shared/GlassCard';
import { colors, spacing, typography } from '@/theme/theme';

export default function IntroStep() {
  return (
    <GlassCard innerStyle={styles.introPad}>
      <View style={styles.introIconWrap}>
        <Info size={26} color={colors.accent} />
      </View>
      <Text style={styles.introTitle}>This will be a 24-hour plan</Text>
      <Text style={styles.introBody}>
        Pick which piles go into today's plan, assign a rig and crane to each
        one, choose a supervisor, and set a start time. Once generated, the
        plan runs for the next 24 hours.
      </Text>
      <View style={styles.introListItem}>
        <Text style={styles.introListNum}>1</Text>
        <Text style={styles.introListText}>Select piles for today</Text>
      </View>
      <View style={styles.introListItem}>
        <Text style={styles.introListNum}>2</Text>
        <Text style={styles.introListText}>Assign a rig and crane to each pile</Text>
      </View>
      <View style={styles.introListItem}>
        <Text style={styles.introListNum}>3</Text>
        <Text style={styles.introListText}>Choose the supervisor on duty</Text>
      </View>
      <View style={styles.introListItem}>
        <Text style={styles.introListNum}>4</Text>
        <Text style={styles.introListText}>Review and generate the plan</Text>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  introPad: { padding: spacing.lg },
  introIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  introTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  introBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  introListItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  introListNum: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
    width: 20,
  },
  introListText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
});