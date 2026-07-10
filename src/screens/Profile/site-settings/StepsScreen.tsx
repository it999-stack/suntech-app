// src/screens/Profile/site-settings/StepsScreen.tsx
// Lists all seeded piling steps grouped by track (RIG / CRANE).
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
import { ChevronRight, Drill, Construction } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, spacing, radius, typography } from '@/theme/theme';
import GlassCard from '@components/shared/GlassCard';
import { getSteps } from '@repositories/stepsRepository';
import type { PilingStep } from '@/db/schema';
import type { ProfileStackParamList } from '@/types/navigation';

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'Steps'>;

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

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
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

  const rigSteps   = steps.filter((s) => s.track === 'RIG');
  const craneSteps = steps.filter((s) => s.track === 'CRANE');

  type ListItem =
    | { type: 'header'; key: string; title: string }
    | { type: 'step'; key: string; step: PilingStep };

  const listData: ListItem[] = [
    ...(rigSteps.length   ? [{ type: 'header' as const, key: 'h_rig',   title: 'Rig Steps' }]   : []),
    ...rigSteps.map((s)   => ({ type: 'step'   as const, key: s.id, step: s })),
    ...(craneSteps.length ? [{ type: 'header' as const, key: 'h_crane', title: 'Crane Steps' }] : []),
    ...craneSteps.map((s) => ({ type: 'step'   as const, key: s.id, step: s })),
  ];

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
            data={listData}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              if (item.type === 'header') return <SectionHeader title={item.title} />;
              return <StepRow step={item.step} />;
            }}
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
  sectionHeader: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: 2,
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