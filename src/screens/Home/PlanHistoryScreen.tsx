// src/screens/PlanHistoryScreen.tsx
//
// Shows all daily checklists for this site, most-recent first, loaded from SQLite.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Calendar, ChevronRight, ChevronLeft } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import { colors, spacing, radius, typography } from '@theme/theme';
import { HomeStackParamList } from '@app-types/navigation';
import { useAuthStore } from '@store/authStore';
import { getChecklistsBySite, getChecklistPileTimings } from '@repositories/checklistRepository';
import EmptyState from '@/components/shared/EmptyState';
import {
  computeChecklistProgress,
  computeDisplayStatus,
  formatVariance,
  type DisplayStatus,
} from '@utils/checklistProgress';
import { planEndTime } from '@app-types/plan';
import { formatRelativeDayLabel, toLocalDateStr } from '@utils/formatTime';

type HomeNav = NativeStackNavigationProp<HomeStackParamList, 'PlanHistory'>;

type ChecklistSummary = {
  id: string;
  date: string;            // ISO date "YYYY-MM-DD"
  displayDate: string;     // human-readable
  pileCount: number;
  completionPercent: number;
  completedCount: number;
  varianceLabel: string | null;
  status: DisplayStatus;
};

function statusConfig(status: DisplayStatus) {
  switch (status) {
    case 'completed_on_time': return { bg: colors.successSoft,    fg: colors.success,       label: 'Completed'            };
    case 'completed_late':    return { bg: colors.successSoft,    fg: colors.success,       label: 'Completed late'       };
    case 'overdue':           return { bg: 'rgba(239,68,68,0.10)', fg: colors.danger,        label: 'Overdue'              };
    case 'in_progress':       return { bg: colors.accentSoft,     fg: colors.accent,        label: 'In progress'          };
    case 'partially_completed': return { bg: 'rgba(255,149,0,0.10)', fg: colors.warning,    label: 'Partially completed'  };
    case 'upcoming':          return { bg: 'rgba(28,28,46,0.06)', fg: colors.textSecondary, label: 'Upcoming'             };
    case 'not_started':
    default:                  return { bg: 'rgba(28,28,46,0.06)', fg: colors.textSecondary, label: 'Not started'          };
  }
}

function progressBarColor(status: DisplayStatus): string {
  if (status === 'completed_on_time') return colors.success;
  if (status === 'completed_late') return colors.success;
  if (status === 'overdue') return colors.danger;
  if (status === 'partially_completed') return colors.warning;
  if (status === 'in_progress') return colors.accent;
  return colors.textSecondary;
}

export default function PlanHistoryScreen() {
  const navigation = useNavigation<HomeNav>();
  const user = useAuthStore((s) => s.user);

  const [summaries, setSummaries] = useState<ChecklistSummary[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadSummaries() {
    if (!user?.siteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const today = toLocalDateStr(new Date());
      const checklists = await getChecklistsBySite(user.siteId!);
      const withCounts = await Promise.all(
        checklists.map(async (cl) => {
          const timings = await getChecklistPileTimings(cl.id);
          const windowEndIso = cl.planStartTime ? planEndTime(cl.planStartTime) : undefined;
          const progress = computeChecklistProgress(timings, new Date(), windowEndIso);
          const status = computeDisplayStatus(progress, {
            isFutureDate: cl.date > today,
            isToday: cl.date === today,
          });
          return {
            id: cl.id,
            date: cl.date,
            displayDate: formatRelativeDayLabel(cl.date, {
              neighbor: 'yesterday',
              locale: 'en-IN',
              dateFormatOptions: { day: 'numeric', month: 'short', year: 'numeric' },
            }),
            pileCount: timings.length,
            completionPercent: progress.completionPercent,
            completedCount: progress.completedCount,
            varianceLabel: formatVariance(progress.varianceMinutes),
            status,
          } as ChecklistSummary;
        }),
      );
      setSummaries(withCounts.sort((a, b) => b.date.localeCompare(a.date)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummaries();
  }, [user?.siteId]);

  return (
    <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.headerArea}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
            <ChevronLeft size={22} color={colors.accent} />
          </Pressable>
          <Text style={styles.pageTitle}>Plan History</Text>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Loading plans…</Text>
          </View>
        ) : summaries.length === 0 ? (
          <GlassCard>
            <EmptyState icon="calendar" title="No plans yet" message="No plans found for this site yet." />
          </GlassCard>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {summaries.map((cl) => {
              const st = statusConfig(cl.status);
              const showBar = cl.status !== 'upcoming';
              const subParts = [`${cl.pileCount} pile${cl.pileCount === 1 ? '' : 's'} planned`];
              if (cl.status !== 'upcoming' && cl.status !== 'not_started') {
                subParts.push(`${cl.completionPercent}% complete`);
                if (cl.varianceLabel) subParts.push(cl.varianceLabel);
              }

              return (
                <Pressable
                  key={cl.id}
                  onPress={() => navigation.navigate('PlanDetail', { checklistId: cl.id })}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <GlassCard innerStyle={styles.cardInner}>
                    <View style={styles.topRow}>
                      <View style={styles.rowLeft}>
                        <View style={styles.iconWrap}>
                          <Calendar size={16} color={colors.accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.dateText}>{cl.displayDate}</Text>
                          <Text style={styles.subText}>{subParts.join(' · ')}</Text>
                        </View>
                      </View>
                      <View style={styles.rowRight}>
                        <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                          <Text style={[styles.statusBadgeText, { color: st.fg }]}>{st.label}</Text>
                        </View>
                        
                        <ChevronRight size={18} color={colors.textSecondary} />
                      </View>
                    </View>

                    {showBar && (
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${Math.min(100, cl.completionPercent)}%`,
                              backgroundColor: progressBarColor(cl.status),
                            },
                          ]}
                        />
                      </View>
                    )}
                  </GlassCard>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  headerArea: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: { ...typography.h1, color: colors.textPrimary },
  loadingText: { ...typography.body, color: colors.textSecondary },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },

  cardInner: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: { ...typography.cardTitle, color: colors.textPrimary },
  subText: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  statusBadgeText: { ...typography.caption, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(28,28,46,0.06)',
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  progressFill: { height: '100%', borderRadius: 3 },
});