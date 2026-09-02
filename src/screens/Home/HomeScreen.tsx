// src/screens/HomeScreen.tsx

import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NotebookPen, Sparkles, Cylinder, Truck, Layers, PencilLine, ListChecks, Eye } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import ProgressRing from '@components/shared/ProgressRing';
import GradientTile from '@components/shared/GradientTile';
import Button from '@components/shared/Button';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import { usePlan } from '@state/PlanContext';
import GeneratePlanCalendarSheet from '@components/plan/generate/GeneratePlanCalendarSheet';
import WorkingDateSheet from '@components/shared/WorkingDateSheet';
import { useAuthStore } from '@store/authStore';
import { useWorkingDate } from '@store/workingDateStore';
import { getPersonnelBySite } from '@repositories/personnelRepository';
import { getChecklistPersonnel } from '@repositories/checklistRepository';
import { getMachinesBySite } from '@repositories/machinesRepository';
import { formatTime } from '@utils/formatTime';
import { derivePileStatus } from '@utils/helpers';
import type { PilingSitePersonnel, PilingChecklistPersonnel, PilingMachine } from '@db/schema';

function getDateParts(dateStr: string): { day: string; month: string } {
  const d = new Date(`${dateStr}T00:00:00`);
  return {
    day: d.toLocaleDateString('en-IN', { day: '2-digit' }),
    month: d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase(),
  };
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
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
      <View style={styles.greetingRow}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{getInitials(userName)}</Text>
        </View>
        <View style={styles.greetingBlock}>
          <Text style={styles.helloText}>Hello, {userName}</Text>
          <Text style={styles.siteText}>{siteName}</Text>
        </View>
      </View>

      <View style={styles.headerRightCol}>
        <Pressable
          hitSlop={10}
          onPress={onSettingsPress}
        >
          <DateBadge dateStr={workingDate} onPress={onDatePress} />
        </Pressable>
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
      <Button label="Generate today's plan" icon={Sparkles} onPress={onGenerate} />
    </GlassCard>
  );
}

function ActivePlanCard({
  onView,
  onEdit,
  onPreview,
  hasProgress,
  supervisor,
  planStartTime,
  completed,
  totalSteps,
}: {
  onView: () => void;
  onEdit: () => void;
  onPreview: () => void;
  hasProgress: boolean;
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

        {hasProgress ? (
          <Button label="Preview Plan" size="sm" icon={Eye} onPress={onPreview} />
        ) : (
          <Button label="Edit Plan" size="sm" icon={PencilLine} onPress={onEdit} />
        )}
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
      <Button label="Update progress" icon={ListChecks} onPress={onView} />
    </GlassCard>
  );
}

function SiteSnapshotRow({
  plannedMachines,
  totalMachines,
  completedPiles,
  totalPiles,
}: {
  plannedMachines: number;
  totalMachines: number;
  completedPiles: number;
  totalPiles: number;
}) {
  return (
    <View style={styles.snapshotSection}>
      <Text style={styles.sectionLabel}>Site snapshot</Text>
      <View style={styles.snapshotRow}>
        <View style={styles.snapshotCard}>
          <View style={[styles.snapshotIconCircle, { backgroundColor: colors.accent }]}>
            <Truck size={15} color={colors.white} />
          </View>
          <View>
            <Text style={styles.snapshotValue}>
              {plannedMachines}/{totalMachines}
            </Text>
            <Text style={styles.snapshotLabel}>Machines</Text>
          </View>
        </View>
        <View style={styles.snapshotCard}>
          <View style={[styles.snapshotIconCircle, { backgroundColor: colors.accentPink }]}>
            <Layers size={15} color={colors.white} />
          </View>
          <View>
            <Text style={styles.snapshotValue}>
              {completedPiles}/{totalPiles}
            </Text>
            <Text style={styles.snapshotLabel}>Piles</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { checklist, planStatus, actualSteps, planSteps, checklistPiles, loadChecklist, isLoading } = usePlan();
  const workingDate = useWorkingDate();

  useEffect(() => {
    if (user?.siteId) {
      loadChecklist(user.siteId, workingDate);
    }
  }, [user?.siteId, workingDate, loadChecklist]);

  const [personnel, setPersonnel] = useState<PilingSitePersonnel[]>([]);
  useEffect(() => {
    if (user?.siteId) {
      getPersonnelBySite(user.siteId).then(setPersonnel).catch(() => {});
    }
  }, [user?.siteId]);

  const [machines, setMachines] = useState<PilingMachine[]>([]);
  useEffect(() => {
    if (user?.siteId) {
      getMachinesBySite(user.siteId).then(setMachines).catch(() => {});
    }
  }, [user?.siteId]);

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

  const completedSteps = useMemo(
    () => actualSteps.filter((a) => a.actualEnd).length,
    [actualSteps],
  );

  const hasProgress = useMemo(
    () => actualSteps.some((a) => a.actualStart || a.actualEnd),
    [actualSteps],
  );

  const pilesInProgressCount = useMemo(() => {
    if (planStatus === 'none') return 0;
    return checklistPiles.filter((cp) => {
      const pileSteps = planSteps.filter((s) => s.checklistPileId === cp.id);
      const pileActuals = actualSteps.filter((a) => a.checklistPileId === cp.id);
      return derivePileStatus(pileSteps.length, pileActuals) === 'in_progress';
    }).length;
  }, [planStatus, checklistPiles, planSteps, actualSteps]);

  const completedPilesCount = useMemo(() => {
    if (planStatus === 'none') return 0;
    return checklistPiles.filter((cp) => {
      const pileSteps = planSteps.filter((s) => s.checklistPileId === cp.id);
      const pileActuals = actualSteps.filter((a) => a.checklistPileId === cp.id);
      return derivePileStatus(pileSteps.length, pileActuals) === 'completed';
    }).length;
  }, [planStatus, checklistPiles, planSteps, actualSteps]);

  // Distinct rig/crane ids actually assigned to today's checklist piles —
  // "planned" as in "in use by today's plan", not the site's full fleet.
  const plannedMachinesCount = useMemo(() => {
    const ids = new Set<string>();
    for (const cp of checklistPiles) {
      ids.add(cp.rigId);
      if (cp.craneId) ids.add(cp.craneId);
    }
    return ids.size;
  }, [checklistPiles]);

  const userName = user?.name ?? 'User';
  const siteName = user?.siteName ?? 'Your Site';

  const [calendarSheetVisible, setCalendarSheetVisible] = useState(false);
  const [workingDateSheetVisible, setWorkingDateSheetVisible] = useState(false);

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
              onPreview={() => checklist && navigation.navigate('PlanDetail', { checklistId: checklist.id })}
              hasProgress={hasProgress}
              supervisor={supervisorName}
              planStartTime={checklist?.planStartTime ?? null}
              completed={completedSteps}
              totalSteps={planSteps.length}
            />
          )}

          <Text style={styles.sectionLabel}>Quick access</Text>
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

          <SiteSnapshotRow
            plannedMachines={plannedMachinesCount}
            totalMachines={machines.length}
            completedPiles={completedPilesCount}
            totalPiles={checklistPiles.length}
          />
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
  space: { paddingVertical: spacing.sm },
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
    marginTop: spacing.lg,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  headerRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },

  dateBadge: {
    width: 48,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.soft,
  },
  dateBadgeDay: {
    fontSize: 17,
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

  greetingBlock: { flexShrink: 1 },
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
    alignItems: 'flex-start',
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

  sectionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginTop: -spacing.xs,
  },

  quickRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickCard: { flex: 1 },

  snapshotSection: {},
  snapshotRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  snapshotCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: spacing.md,
    ...shadow.soft,
  },
  snapshotIconCircle: {
    width: 30,
    height: 30,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapshotValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 20,
  },
  snapshotLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
});