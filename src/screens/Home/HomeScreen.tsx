// src/screens/HomeScreen.tsx

import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NotebookPen, Settings, Sparkles, Pencil, Cylinder } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import ProgressRing from '@components/shared/ProgressRing';
import GradientTile from '@components/shared/GradientTile';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import { usePlan } from '@state/PlanContext';
import GeneratePlanCalendarSheet from '@components/plan/generate/GeneratePlanCalendarSheet';
import WorkingDateSheet from '@components/shared/WorkingDateSheet';
import { useAuthStore } from '@store/authStore';
import { useWorkingDate } from '@store/workingDateStore';
import { getPersonnelBySite } from '@repositories/personnelRepository';
import { getChecklistPersonnel } from '@repositories/checklistRepository';
import { formatTime } from '@utils/formatTime';
import { derivePileStatus } from '@utils/helpers';
import type { PilingSitePersonnel, PilingChecklistPersonnel } from '@db/schema';

function getDateParts(dateStr: string): { day: string; month: string } {
  const d = new Date(`${dateStr}T00:00:00`);
  return {
    day: d.toLocaleDateString('en-IN', { day: '2-digit' }),
    month: d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase(),
  };
}

function DateBadge({ dateStr, onPress }: { dateStr: string; onPress: () => void }) {
  const { day, month } = getDateParts(dateStr);
  return (
    <Pressable hitSlop={10} onPress={onPress}>
      <View style={styles.dateBadge}>
        <Text style={styles.dateBadgeDay}>{day}</Text>
        <Text style={styles.dateBadgeMonth}>{month}</Text>
      </View>
    </Pressable>
  );
}

function HeaderArea({
  userName,
  siteName,
  workingDate,
  onSettingsPress,
  onDatePress,
}: {
  userName: string;
  siteName: string;
  workingDate: string;
  onSettingsPress: () => void;
  onDatePress: () => void;
}) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.greetingBlock}>
        <Text style={styles.helloText}>Hello, {userName}</Text>
        <Text style={styles.siteText}>{siteName}</Text>
      </View>
      <View style={styles.headerRightCol}>
        <Pressable hitSlop={10} onPress={onSettingsPress}>
          <View style={styles.settingsBtn}>
            <Settings size={18} color={colors.textSecondary} />
          </View>
        </Pressable>
        <DateBadge dateStr={workingDate} onPress={onDatePress} />
      </View>
    </View>
  );
}

function NoPlanCard({ onGenerate }: { onGenerate: () => void }) {
  return (
    <GlassCard style={styles.planCard} innerStyle={styles.noPlanPad}>
      <View style={styles.noPlanHeaderRow}>
        <Text style={styles.noPlanTitle}>No plan generated yet</Text>
        <Sparkles size={20} color={colors.accent} />
      </View>
      <Text style={styles.noPlanBody}>
        Pick your piles, assign a rig and crane, choose a supervisor, and set a start time.
      </Text>
      <Pressable style={styles.primaryBtn} onPress={onGenerate}>
        <Text style={styles.primaryBtnText}>Generate today's plan</Text>
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
  totalSteps,
}: {
  onView: () => void;
  onEdit: () => void;
  supervisor: string;
  planStartTime: string | null;
  completed: number;
  totalSteps: number;
}) {
  const total = Math.max(totalSteps, 1);
  const pct = Math.round((completed / total) * 100);

  return (
    <GlassCard style={styles.planCard} innerStyle={{ padding: spacing.lg }}>
      {/* Header */}
      <View style={styles.planHeaderRow}>
        <View>
          <Text style={styles.planTitle}>Today's Plan</Text>
          <Text style={styles.planMeta}>
            Started {formatTime(planStartTime)}
          </Text>
        </View>

        <Pressable
          onPress={onEdit}
          hitSlop={10}
          style={styles.editCircle}
        >
          <Pencil size={16} color={colors.white} />
        </Pressable>
      </View>

      {/* Progress */}
      <View style={styles.progressSection}>
        <ProgressRing percent={pct}>
          <Text style={styles.progressPercent}>{pct}%</Text>
          <Text style={styles.progressLabel}>Overall</Text>
        </ProgressRing>

        <Text style={styles.progressTitle}>
          Keep recording actuals
        </Text>

        <Text style={styles.progressSubtitle}>
          Update today's progress by filling actual values.
        </Text>
      </View>

      {/* CTA */}
      <Pressable style={styles.primaryBtn} onPress={onView}>
        <Text style={styles.primaryBtnText}>Update progress</Text>
      </Pressable>
    </GlassCard>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { checklist, planStatus, actualSteps, planSteps, checklistPiles, loadChecklist, isLoading } = usePlan();
  const workingDate = useWorkingDate();

  // Load the working date's checklist on mount (or whenever the working date changes)
  useEffect(() => {
    if (user?.siteId) {
      loadChecklist(user.siteId, workingDate);
    }
  }, [user?.siteId, workingDate, loadChecklist]);

  // Load personnel to resolve supervisor names
  const [personnel, setPersonnel] = useState<PilingSitePersonnel[]>([]);
  useEffect(() => {
    if (user?.siteId) {
      getPersonnelBySite(user.siteId).then(setPersonnel).catch(() => {});
    }
  }, [user?.siteId]);

  // Load this checklist's role assignments, to resolve the Shift Incharge
  // (Shift 1) name shown on the home card — the closest equivalent to what
  // "supervisor" used to mean before the multi-role system replaced it.
  const [checklistPersonnel, setChecklistPersonnel] = useState<PilingChecklistPersonnel[]>([]);
  useEffect(() => {
    if (checklist) {
      getChecklistPersonnel(checklist.id).then(setChecklistPersonnel).catch(() => {});
    } else {
      setChecklistPersonnel([]);
    }
  }, [checklist]);

  const supervisorName = useMemo(() => {
    const shiftIncharge1 = checklistPersonnel.find((r) => r.role === 'SHIFT_INCHARGE' && r.shiftSlot === 1);
    if (!shiftIncharge1) return 'Shift Incharge';
    const p = personnel.find((p) => p.id === shiftIncharge1.personnelId);
    return p?.name ?? 'Shift Incharge';
  }, [checklistPersonnel, personnel]);

  // Completed-step count for the plan card's progress ring.
  const completedSteps = useMemo(
    () => actualSteps.filter((a) => a.actualEnd).length,
    [actualSteps],
  );

  // Active count shown on the "Piles in progress" quick-action tile.
  const pilesInProgressCount = useMemo(() => {
    if (planStatus === 'none') return 0;
    return checklistPiles.filter((cp) => {
      const pileSteps = planSteps.filter((s) => s.checklistPileId === cp.id);
      const pileActuals = actualSteps.filter((a) => a.checklistPileId === cp.id);
      return derivePileStatus(pileSteps.length, pileActuals) === 'in_progress';
    }).length;
  }, [planStatus, checklistPiles, planSteps, actualSteps]);

  const userName = user?.name ?? 'User';
  const siteName = user?.siteName ?? 'Your Site';

  const [calendarSheetVisible, setCalendarSheetVisible] = useState(false);
  const [workingDateSheetVisible, setWorkingDateSheetVisible] = useState(false);

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
    <LinearGradient colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]} style={[styles.flex, styles.space]}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.headerArea}>
          <HeaderArea
            userName={userName}
            siteName={siteName}
            workingDate={workingDate}
            onSettingsPress={() => setWorkingDateSheetVisible(true)}
            onDatePress={() => setWorkingDateSheetVisible(true)}
          />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {planStatus === 'none' ? (
            <NoPlanCard onGenerate={() => setCalendarSheetVisible(true)} />
          ) : (
            <ActivePlanCard
              onView={() => navigation.navigate('FillActuals', { date: workingDate })}
              onEdit={() => navigation.navigate('GeneratePlan', { edit: true, date: workingDate })}
              supervisor={supervisorName}
              planStartTime={checklist?.planStartTime ?? null}
              completed={completedSteps}
              totalSteps={planSteps.length}
            />
          )}

          <View style={styles.quickRow}>
            <GradientTile
              style={styles.quickCard}
              gradientColors={colors.backdropGradient}
              icon={<NotebookPen size={16} color={colors.white} />}
              iconBg={colors.textPrimary}
              title="Plan history"
              subtitle="Past 12 days"
              onPress={() => navigation.navigate('PlanHistory')}
            />
            <GradientTile
              style={styles.quickCard}
              gradientColors={colors.creamGradient}
              icon={<Cylinder  size={16} color={colors.white} />}
              iconBg={colors.accentPink}
              title={'Piles in progress'}
              subtitle={`${pilesInProgressCount} active`}
              onPress={() => navigation.navigate('FillActuals', { date: workingDate })}
              iconAlign="right"
            />
          </View>
        </ScrollView>
      </SafeAreaView>

      {user?.siteId && (
        <GeneratePlanCalendarSheet
          visible={calendarSheetVisible}
          onClose={() => setCalendarSheetVisible(false)}
          siteId={user.siteId}
          onConfirm={(date, hasExistingPlan) => {
            setCalendarSheetVisible(false);
            navigation.navigate('GeneratePlan', { date, edit: hasExistingPlan });
          }}
        />
      )}

      <WorkingDateSheet
        visible={workingDateSheetVisible}
        onClose={() => setWorkingDateSheetVisible(false)}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  space: { paddingVertical: spacing.sm},
  center: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { ...typography.body, color: colors.textSecondary },

  headerArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerRightCol: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },

  dateBadge: {
    width: 50,
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.soft,
  },
  dateBadgeDay: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 20,
  },
  dateBadgeMonth: {
    fontSize: 9,
    fontWeight: '500',
    color: colors.textSecondary,
    letterSpacing: 0.4,
    marginTop: 2,
  },

  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },

  greetingBlock: {},
  helloText: {
    ...typography.h1,
    color: colors.textPrimary,
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
  noPlanHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
    marginBottom: spacing.xs,
  },
  noPlanTitle: {
    ...typography.h2,
    color: colors.textPrimary,
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

  editCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },

  progressSection: {
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },

  progressPercent: {
    fontSize: 38,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  progressLabel: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: 2,
  },

  progressTitle: {
    marginTop: spacing.lg,
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  progressSubtitle: {
    marginTop: 6,
    textAlign: 'center',
    color: colors.textSecondary,
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
  },

  primaryBtn: {
    backgroundColor: colors.textPrimary,
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
  planTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  planMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.md,
  },

  // ── Quick action row — two uniform GradientTile tiles ────────────────────
  quickRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickCard: { flex: 1 },
});
