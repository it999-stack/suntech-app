// src/screens/PlanDetailScreen.tsx

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute } from '@react-navigation/native';
import { CheckCircle2, Circle, TrendingDown, TrendingUp } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import { HomeStackParamList } from '@app-types/navigation';

type PlanDetailRouteProp = RouteProp<HomeStackParamList, 'PlanDetail'>;
type Tab = 'timeline' | 'gap';
type Track = 'RIG' | 'CRANE';

type TimelineStep = {
  id: string;
  pileCode: string;
  stepName: string;
  track: Track;
  start: string;
  end: string;
  done: boolean;
};

type GapRow = {
  id: string;
  pileCode: string;
  stepName: string;
  plannedMin: number;
  actualMin: number;
};

// Mock data — replace with SQLite-driven query scoped to this checklistId
const MOCK_TIMELINE: TimelineStep[] = [
  { id: '1', pileCode: 'P-01', stepName: 'Casing', track: 'RIG',   start: '14:30', end: '15:00', done: true  },
  { id: '2', pileCode: 'P-01', stepName: 'Boring', track: 'RIG',   start: '15:10', end: '16:10', done: true  },
  { id: '3', pileCode: 'P-02', stepName: 'Casing', track: 'RIG',   start: '16:10', end: '16:40', done: false },
  { id: '4', pileCode: 'P-02', stepName: 'Boring', track: 'RIG',   start: '16:50', end: '17:50', done: false },
];

const MOCK_GAP: GapRow[] = [
  { id: '1', pileCode: 'P-01', stepName: 'Casing', plannedMin: 30, actualMin: 32 },
  { id: '2', pileCode: 'P-01', stepName: 'Boring', plannedMin: 60, actualMin: 55 },
  { id: '3', pileCode: 'P-01', stepName: 'Cage',   plannedMin: 60, actualMin: 70 },
];

const MOCK_GAP_SUMMARY = {
  totalPlannedMin: 150,
  totalActualMin: 157,
  onTimeStepCount: 1,
  totalStepCount: 3,
};

function TimelineTab() {
  return (
    <GlassCard>
      {MOCK_TIMELINE.map((step, idx) => (
        <View key={step.id} style={styles.timelineRow}>
          <View style={styles.timelineMarkerCol}>
            {step.done ? (
              <CheckCircle2 size={18} color={colors.success} />
            ) : (
              <Circle size={18} color={colors.textSecondary} />
            )}
            {idx < MOCK_TIMELINE.length - 1 && <View style={styles.timelineLine} />}
          </View>
          <View style={[styles.timelineContent, idx === MOCK_TIMELINE.length - 1 && styles.timelineContentLast]}>
            <View style={styles.rowBetween}>
              <Text style={styles.stepName}>{step.pileCode} · {step.stepName}</Text>
              <View
                style={[
                  styles.trackBadge,
                  { backgroundColor: step.track === 'RIG' ? colors.accentSoft : 'rgba(255,149,0,0.12)' },
                ]}
              >
                <Text
                  style={[
                    styles.trackTag,
                    { color: step.track === 'RIG' ? colors.accent : colors.warning },
                  ]}
                >
                  {step.track}
                </Text>
              </View>
            </View>
            <Text style={styles.stepTime}>
              {step.start} – {step.end}{step.done ? ' · Logged' : ''}
            </Text>
          </View>
        </View>
      ))}
    </GlassCard>
  );
}

function GapReportTab() {
  const variance = MOCK_GAP_SUMMARY.totalActualMin - MOCK_GAP_SUMMARY.totalPlannedMin;
  const isOverrun = variance > 0;

  return (
    <View style={styles.gapWrap}>
      {/* Summary stats */}
      <View style={styles.statsRow}>
        <GlassCard style={styles.statCard}>
          <Text style={styles.statLabel}>Total variance</Text>
          <View style={styles.rowCenter}>
            {isOverrun ? (
              <TrendingUp size={16} color={colors.danger} />
            ) : (
              <TrendingDown size={16} color={colors.success} />
            )}
            <Text style={[styles.statValue, { color: isOverrun ? colors.danger : colors.success }]}>
              {isOverrun ? '+' : ''}{variance}m
            </Text>
          </View>
        </GlassCard>
        <GlassCard style={styles.statCard}>
          <Text style={styles.statLabel}>On-time steps</Text>
          <Text style={styles.statValue}>
            {MOCK_GAP_SUMMARY.onTimeStepCount}/{MOCK_GAP_SUMMARY.totalStepCount}
          </Text>
        </GlassCard>
      </View>

      {/* Per-step breakdown */}
      <GlassCard style={{ marginTop: spacing.lg }}>
        {MOCK_GAP.map((row, idx) => {
          const diff = row.actualMin - row.plannedMin;
          return (
            <View key={row.id}>
              <View style={styles.gapRow}>
                <View>
                  <Text style={styles.rowLabel}>{row.pileCode} · {row.stepName}</Text>
                  <Text style={styles.rowSub}>
                    Planned {row.plannedMin}m · Actual {row.actualMin}m
                  </Text>
                </View>
                <Text
                  style={[
                    styles.diffText,
                    { color: diff > 0 ? colors.danger : diff < 0 ? colors.success : colors.textSecondary },
                  ]}
                >
                  {diff > 0 ? '+' : ''}{diff}m
                </Text>
              </View>
              {idx < MOCK_GAP.length - 1 && <View style={styles.divider} />}
            </View>
          );
        })}
      </GlassCard>
    </View>
  );
}

export default function PlanDetailScreen() {
  const route = useRoute<PlanDetailRouteProp>();
  const { checklistId } = route.params;
  const [tab, setTab] = useState<Tab>('timeline');

  return (
    <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.headerArea}>
          <Text style={styles.pageTitle}>Plan Detail</Text>
          <Text style={styles.checklistIdText}>Checklist {checklistId}</Text>

          <View style={styles.segmented}>
            <Pressable
              style={[styles.segment, tab === 'timeline' && styles.segmentActive]}
              onPress={() => setTab('timeline')}
            >
              <Text style={[styles.segmentText, tab === 'timeline' && styles.segmentTextActive]}>
                Timeline
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segment, tab === 'gap' && styles.segmentActive]}
              onPress={() => setTab('gap')}
            >
              <Text style={[styles.segmentText, tab === 'gap' && styles.segmentTextActive]}>
                Gap Report
              </Text>
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {tab === 'timeline' ? <TimelineTab /> : <GapReportTab />}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  pageTitle: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  checklistIdText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.lg,
  },

  segmented: {
    flexDirection: 'row',
    backgroundColor: 'rgba(28,28,46,0.06)',
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.lg,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.white,
    ...shadow.soft,
  },
  segmentText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },

  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },

  // Timeline
  timelineRow: {
    flexDirection: 'row',
  },
  timelineMarkerCol: {
    alignItems: 'center',
    width: 22,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(28,28,46,0.1)',
    marginVertical: 3,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: spacing.lg,
    paddingLeft: spacing.sm,
  },
  timelineContentLast: {
    paddingBottom: 0,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepName: {
    ...typography.cardTitle,
    color: colors.textPrimary,
  },
  trackBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  trackTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  stepTime: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Gap report
  gapWrap: {
    gap: 0,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  statValue: {
    ...typography.statNumber,
    color: colors.textPrimary,
  },
  gapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  rowLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  rowSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  diffText: {
    ...typography.h2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(28,28,46,0.06)',
    marginVertical: spacing.xs,
  },
});
