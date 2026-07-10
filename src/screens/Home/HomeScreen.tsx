// src/screens/HomeScreen.tsx
//
// Dynamic home screen. On mount, loads today's checklist from SQLite to
// determine whether a plan exists. Shows real user/site data from auth store
// and resolves supervisor names from local personnel data.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import { ClipboardList, Signpost, Settings, Sparkles, Pencil } from 'lucide-react-native';
import GlassCard from '../../components/shared/GlassCard';
import { colors, spacing, radius, typography, shadow } from '../../theme/theme';
import { usePlan } from '../../state/PlanContext';
import { useAuthStore } from '../../store/authStore';
import { getPersonnelBySite } from '../../repositories/personnelRepository';
import { formatTime } from '../../utils/formatTime';
import type { PilingPersonnel } from '../../db/schema';

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function GreetingHeader({ userName, siteName }: { userName: string; siteName: string }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <View style={styles.greetingBlock}>
      <Text style={styles.eyebrow}>{greeting}</Text>
      <Text style={styles.helloText}>Hello, {userName} 👋</Text>
      <Text style={styles.siteText}>{siteName}</Text>
    </View>
  );
}

function NoPlanCard({ onGenerate }: { onGenerate: () => void }) {
  return (
    <GlassCard style={styles.planCard} innerStyle={styles.noPlanPad}>
      <View style={styles.noPlanIconWrap}>
        <Sparkles size={24} color={colors.accent} />
      </View>
      <Text style={styles.noPlanTitle}>No plan generated yet</Text>
      <Text style={styles.noPlanBody}>
        Build today's 24-hour plan: pick your piles, assign a rig and crane to
        each, choose a supervisor, and set a start time.
      </Text>
      <Pressable style={styles.primaryBtn} onPress={onGenerate}>
        <Text style={styles.primaryBtnText}>Generate Today's Plan</Text>
      </Pressable>
    </GlassCard>
  );
}

function ActivePlanCard({
  onView,
  onEdit,
  supervisor,
  planStartTime,
  completed,
  inProgress,
  delayed,
  totalSteps,
}: {
  onView: () => void;
  onEdit: () => void;
  supervisor: string;
  planStartTime: string | null;
  completed: number;
  inProgress: number;
  delayed: number;
  totalSteps: number;
}) {
  const total = totalSteps || 1;
  const pct = Math.round((completed / total) * 100);

  return (
    <GlassCard style={styles.planCard} innerStyle={{ padding: spacing.lg }}>
      <View style={styles.planHeaderRow}>
        <Text style={styles.planTitle}>Today's Plan</Text>
        <View style={styles.planHeaderRight}>
          <Pressable onPress={onEdit} hitSlop={10} style={styles.editBtn}>
            <Pencil size={15} color={colors.textSecondary} />
          </Pressable>
          <View style={styles.pctBadge}>
            <Text style={styles.pctText}>{pct}%</Text>
          </View>
        </View>
      </View>
      <Text style={styles.planMeta}>
        {supervisor} · Started {formatTime(planStartTime)}
      </Text>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statPill, { backgroundColor: 'rgba(52,199,89,0.12)' }]}>
          <Text style={[styles.statNum, { color: colors.success }]}>{completed}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={[styles.statPill, { backgroundColor: colors.accentSoft }]}>
          <Text style={[styles.statNum, { color: colors.accent }]}>{inProgress}</Text>
          <Text style={styles.statLabel}>In Progress</Text>
        </View>
        <View style={[styles.statPill, { backgroundColor: 'rgba(255,149,0,0.12)' }]}>
          <Text style={[styles.statNum, { color: colors.warning }]}>{delayed}</Text>
          <Text style={styles.statLabel}>Delayed</Text>
        </View>
      </View>

      <Pressable style={styles.primaryBtn} onPress={onView}>
        <Text style={styles.primaryBtnText}>Fill Actuals</Text>
      </Pressable>
    </GlassCard>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { checklist, planStatus, actualSteps, planSteps, loadChecklist, isLoading } = usePlan();
  const today = toLocalDateStr(new Date());

  // Load today's checklist on mount
  useEffect(() => {
    if (user?.siteId) {
      loadChecklist(user.siteId, today);
    }
  }, [user?.siteId, today, loadChecklist]);

  // Load personnel to resolve supervisor names
  const [personnel, setPersonnel] = useState<PilingPersonnel[]>([]);
  useEffect(() => {
    if (user?.siteId) {
      getPersonnelBySite(user.siteId).then(setPersonnel).catch(() => {});
    }
  }, [user?.siteId]);

  // Resolve supervisor name from ID
  const supervisorName = useMemo(() => {
    if (!checklist?.supervisorId) return 'Supervisor';
    const p = personnel.find((p) => p.id === checklist.supervisorId);
    return p?.name ?? 'Supervisor';
  }, [checklist?.supervisorId, personnel]);

  // Step stats from actual steps
  const stepStats = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let delayed = 0;
    actualSteps.forEach((a) => {
      if (a.actualEnd) completed += 1;
      else if (a.actualStart) inProgress += 1;
    });
    return { completed, inProgress, delayed };
  }, [actualSteps]);

  const userName = user?.name ?? 'User';
  const siteName = user?.siteName ?? 'Your Site';

  // ── Loading state ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
        <SafeAreaView style={[styles.flex, styles.center]} edges={['top']}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { marginTop: spacing.md }]}>Loading your plan…</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.topBar}>
          <Text style={styles.pageTitle}>Home</Text>
          <Pressable hitSlop={10}>
            <View style={styles.settingsBtn}>
              <Settings size={20} color={colors.textSecondary} />
            </View>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <GreetingHeader userName={userName} siteName={siteName} />

          {planStatus === 'none' ? (
            <NoPlanCard onGenerate={() => navigation.navigate('GeneratePlan')} />
          ) : (
            <ActivePlanCard
              onView={() => navigation.navigate('FillActuals')}
              onEdit={() => navigation.navigate('GeneratePlan', { edit: true })}
              supervisor={supervisorName}
              planStartTime={checklist?.planStartTime ?? null}
              completed={stepStats.completed}
              inProgress={stepStats.inProgress}
              delayed={stepStats.delayed}
              totalSteps={planSteps.length}
            />
          )}

          <View style={styles.quickRow}>
            <Pressable
              style={({ pressed }) => [styles.quickCard, pressed && styles.quickPressed]}
              onPress={() => navigation.navigate('PlanHistory')}
            >
              <GlassCard innerStyle={styles.quickPad}>
                <View style={styles.quickIconWrap}>
                  <ClipboardList size={22} color={colors.accent} />
                </View>
                <Text style={styles.quickTitle}>Plan History</Text>
                <Text style={styles.quickSub}>View previous plans</Text>
              </GlassCard>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.quickCard, pressed && styles.quickPressed]}
              onPress={() =>
                navigation.dispatch(
                  CommonActions.navigate({
                    name: 'PilesTab',
                    params: {
                      screen: 'PilesScreen',
                      params: { initialView: 'today', initialFilter: 'in_progress' },
                    },
                  }),
                )
              }
            >
              <GlassCard innerStyle={styles.quickPad}>
                <View style={[styles.quickIconWrap, { backgroundColor: 'rgba(255,149,0,0.12)' }]}>
                  <Signpost size={22} color={colors.warning} />
                </View>
                <Text style={styles.quickTitle}>Piles In Progress</Text>
                <Text style={styles.quickSub}>Continue active work</Text>
              </GlassCard>
            </Pressable>
          </View>

          <View style={styles.syncRow}>
            <View style={styles.syncDot} />
            <Text style={styles.syncText}>All changes synced</Text>
            <Text style={styles.syncTime}>2m ago</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { ...typography.body, color: colors.textSecondary },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  pageTitle: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(28,28,46,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },

  greetingBlock: { marginBottom: spacing.xs },
  eyebrow: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  helloText: {
    ...typography.h1,
    color: colors.textPrimary,
    marginTop: 2,
  },
  siteText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },

  planCard: {},
  noPlanPad: {
    padding: spacing.lg,
    alignItems: 'flex-start',
  },
  noPlanIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  noPlanTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  noPlanBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },

  planHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(28,28,46,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  pctBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  pctText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
  },
  planMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(28,28,46,0.08)',
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statPill: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  statNum: {
    ...typography.h2,
    fontWeight: '800',
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },

  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    ...shadow.soft,
  },
  primaryBtnText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.white,
  },

  quickRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickCard: { flex: 1 },
  quickPressed: { opacity: 0.75 },
  quickPad: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  quickIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  quickTitle: {
    ...typography.cardTitle,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  quickSub: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },

  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: spacing.sm,
  },
  syncText: {
    ...typography.caption,
    color: colors.textPrimary,
    flex: 1,
  },
  syncTime: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});