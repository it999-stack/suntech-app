// src/screens/Site/Tabs/StepsScreen.tsx
// Lists all seeded piling steps in piling_steps.sequence_order — the single
// source of truth for step ordering everywhere in the app, so this list is
// intentionally one flat sequence rather than grouped by track.
// Tap a step to configure duration templates for it.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight, Drill, Construction, Wind } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { MaterialTopTabNavigationProp } from '@react-navigation/material-top-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, spacing, radius, typography } from '@/theme/theme';
import GlassCard from '@components/shared/GlassCard';
import { getSteps } from '@repositories/stepsRepository';
import type { PilingStep } from '@/db/schema';
import type { SiteTopTabParamList, SiteStackParamList } from '@/types/navigation';

// StepsScreen lives inside SiteScreen's top-tab navigator (SiteTopTabParamList),
// but StepDetail is a screen on the parent SiteStackNavigator, not a tab —
// so the nav prop has to be a composite of both.
type Nav = CompositeNavigationProp<
  MaterialTopTabNavigationProp<SiteTopTabParamList, 'Steps'>,
  NativeStackNavigationProp<SiteStackParamList>
>;

const TRACK_META = {
  RIG: {
    label: 'RIG',
    icon: Drill,
    color: '#2b5f8a',
    badgeBg: '#1e3a5f',
  },
  CRANE: {
    label: 'CRANE',
    icon: Construction,
    color: '#2f7a52',
    badgeBg: '#1a3d2e',
  },
  COMPRESSOR: {
    label: 'COMPRESSOR',
    icon: Wind,
    color: '#6D28D9',
    badgeBg: '#3b2166',
  },
} as const;

function StepRow({ step }: { step: PilingStep }) {
  const nav = useNavigation<Nav>();
  const meta = TRACK_META[step.track as keyof typeof TRACK_META] ?? TRACK_META.RIG;
  const Icon = meta.icon;

  return (
    <Pressable
      onPress={() => nav.navigate('StepDetail', { stepId: step.id, stepName: step.stepName })}
      android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
    >
      <GlassCard innerStyle={styles.row}>
        {/* Step number badge */}
        <View style={[styles.numBadge, { backgroundColor: meta.color }]}>
          <Text style={styles.numText}>{step.sequenceOrder}</Text>
        </View>

        {/* Name + track */}
        <View style={styles.rowBody}>
          <Text style={styles.stepName}>{step.stepName}</Text>
          <View style={[styles.trackBadge, { backgroundColor: meta.badgeBg }]}>
            <Icon color="#fff" size={10} strokeWidth={2} />
            <Text style={styles.trackText}>{meta.label}</Text>
          </View>
        </View>

        <ChevronRight color={colors.textSecondary} size={18} />
      </GlassCard>
    </Pressable>
  );
}

export default function StepsScreen() {
  const [steps, setSteps] = useState<PilingStep[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSteps()
      .then(setSteps)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <LinearGradient
      colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]}
      style={styles.flex}
    >
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.headerArea}>
          <Text style={styles.pageTitle}>Piling Steps</Text>
          <Text style={styles.pageSubtitle}>
            {steps.length} steps · tap to configure duration templates
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator
            color={colors.accent}
            size="large"
            style={{ marginTop: spacing.xxxl }}
          />
        ) : (
          <FlatList
            data={steps}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => <StepRow step={item} />}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  pageTitle: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  pageSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    width: '100%',
  },
  numBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  stepName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  trackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  trackText: {
    ...typography.caption,
    color: '#fff',
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});