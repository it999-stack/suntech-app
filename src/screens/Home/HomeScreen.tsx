// src/screens/HomeScreen.tsx

import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { NotebookPen, Cylinder, Truck, Layers, PencilLine, ListChecks, Eye, Trash2 } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import ProgressRing from '@components/shared/ProgressRing';
import Button from '@components/shared/Button';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import { usePlan } from '@state/PlanContext';
import GeneratePlanCalendarSheet from '@components/plan/generate/GeneratePlanCalendarSheet';
import WorkingDateSheet from '@components/shared/WorkingDateSheet';
import ConfirmDialog from '@components/shared/ConfirmDialog';
import { notify } from '@utils/notify';
import { useAuthStore } from '@store/authStore';
import { useWorkingDate } from '@store/workingDateStore';
import { getPersonnelBySite } from '@repositories/personnelRepository';
import { getChecklistPersonnel } from '@repositories/checklistRepository';
import { getMachinesBySite } from '@repositories/machinesRepository';
import { formatTime } from '@utils/formatTime';
import { derivePileStatus } from '@utils/helpers';
import { getApplicableSteps } from '@/services/pileApplicableSteps';
import { useApplicableStepCounts } from './hooks/useApplicableStepCounts';
import HomeHero from './components/HomeHero';
import SiteTargetCard from './components/SiteTargetCard';
import QuickAccessTile from './components/QuickAccessTile';
import RecentPlanActivity from './components/RecentPlanActivity';
import { useSiteStats } from './hooks/useSiteStats';
import { useRecentPlans } from './hooks/useRecentPlans';
import type { PilingSitePersonnel, PilingChecklistPersonnel, PilingMachine } from '@db/schema';
import Avatar from '@/components/shared/Avatar';

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
        <Avatar name={getInitials(userName)} backgroundColor={colors.info} size={42} />
        <View style={styles.greetingBlock}>
          <Text style={styles.helloText}>Hello, {userName} 👋</Text>
           <Text style={styles.siteNameText} numberOfLines={1}>
            {siteName}
          </Text>
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

function ActivePlanCard({
  onView,
  onEdit,
  onPreview,
  onDelete,
  isDeleting,
  hasProgress,
  supervisor,
  planStartTime,
  completed,
  totalSteps,
}: {
  onView: () => void;
  onEdit: () => void;
  onPreview: () => void;
  onDelete: () => void;
  isDeleting: boolean;
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

        <View style={styles.planHeaderActions}>
          {hasProgress ? (
            <Button label="Preview Plan" size="sm" icon={Eye} onPress={onPreview} />
          ) : (
            <Button label="Edit Plan" size="sm" icon={PencilLine} onPress={onEdit} />
          )}
          <Button
            icon={Trash2}
            size="sm"
            variant="secondary"
            iconColor={colors.danger}
            onPress={onDelete}
            disabled={isDeleting}
            hitSlop={8}
            accessibilityLabel="Delete today's plan"
          />
        </View>
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

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const user = useAuthStore((s) => s.user);
  const {
    checklist,
    planStatus,
    actualSteps,
    planSteps,
    checklistPiles,
    pileMeasurementsByPileId,
    loadChecklist,
    deletePlan,
    isDeleting,
    isLoading,
  } = usePlan();
  const workingDate = useWorkingDate();
  const applicableSteps = useApplicableStepCounts(user?.siteId, isFocused);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

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

  /**
   * Everything the delete actually destroys, spelled out. Counts come straight
   * from context — no round trip while the user waits on a modal, and it works
   * on a flaky connection.
   */
  const deleteConfirmMessage = useMemo(() => {
    const loggedEntries = actualSteps.filter((a) => a.actualStart || a.actualEnd).length;
    const measuredPiles = checklistPiles.filter((cp) =>
      pileMeasurementsByPileId.has(cp.pileId),
    ).length;
    const machinesNeedingAttention = machines.filter(
      (m) =>
        m.status !== 'ACTIVE' &&
        checklistPiles.some((cp) => cp.rigId === m.id || cp.craneId === m.id),
    ).length;

    const parts: string[] = [];
    parts.push(
      `This removes the plan for ${workingDate} — ${checklistPiles.length} piles, their planned steps, and ${loggedEntries} logged actual entries.`,
    );

    if (measuredPiles > 0) {
      parts.push(
        `It also removes recorded measurements for ${measuredPiles} ${measuredPiles === 1 ? 'pile' : 'piles'}. Some of those values may have been recorded on earlier days — measurements are stored once per pile, not per day.`,
      );
    }

    if (loggedEntries === 0 && measuredPiles === 0) {
      parts.push('Nothing has been logged against it yet.');
    } else {
      parts.push(
        'Logged progress won’t carry over to a new plan — use Edit Plan instead if you want to keep it.',
      );
    }

    if (machinesNeedingAttention > 0) {
      parts.push(
        'One or more machines are marked broken down or idle — you’ll need to mark them active again before they can be used in a new plan.',
      );
    }

    parts.push('This can’t be undone from the app. You can generate a new plan for this date afterwards.');
    return parts.join('\n\n');
  }, [actualSteps, checklistPiles, pileMeasurementsByPileId, machines, workingDate]);

  const applicableStepCountByPileId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const pileId of applicableSteps.dimensionByPileId.keys()) {
      const dimensionId = applicableSteps.dimensionByPileId.get(pileId);
      counts.set(
        pileId,
        getApplicableSteps(applicableSteps.allSteps, dimensionId, applicableSteps.templateMinutes).length,
      );
    }
    return counts;
  }, [applicableSteps]);

  const pilesInProgressCount = useMemo(() => {
    if (planStatus === 'none') return 0;
    return checklistPiles.filter((cp) => {
      const pileStepCount = applicableStepCountByPileId.get(cp.pileId) ?? 0;
      const pileActuals = actualSteps.filter((a) => a.checklistPileId === cp.id);
      return derivePileStatus(pileStepCount, pileActuals) === 'in_progress';
    }).length;
  }, [planStatus, checklistPiles, applicableStepCountByPileId, actualSteps]);

  const completedPilesCount = useMemo(() => {
    if (planStatus === 'none') return 0;
    return checklistPiles.filter((cp) => {
      const pileStepCount = applicableStepCountByPileId.get(cp.pileId) ?? 0;
      const pileActuals = actualSteps.filter((a) => a.checklistPileId === cp.id);
      return derivePileStatus(pileStepCount, pileActuals) === 'completed';
    }).length;
  }, [planStatus, checklistPiles, applicableStepCountByPileId, actualSteps]);

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

  // Refetch on regaining focus (so counts reflect work done on other tabs)
  // and whenever workingDate changes, so Weekly/Monthly/Daily track whatever
  // date is selected rather than always "the current one".
  const siteStats = useSiteStats(user?.siteId, workingDate, isFocused);
  const recentPlans = useRecentPlans(user?.siteId, isFocused && planStatus);
  const userName = user?.name ?? 'User';
  const siteName = user?.siteName ?? 'Your Site';

  const [calendarSheetVisible, setCalendarSheetVisible] = useState(false);
  const [workingDateSheetVisible, setWorkingDateSheetVisible] = useState(false);

  if (isLoading && isFocused) {
    return (
      <View style={styles.flex}>
        <View style={[styles.flex, styles.center]}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { marginTop: spacing.md }]}>Loading your plan…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.flex, styles.space]}>
      <View style={styles.flex}>
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
            <HomeHero onGenerate={() => setCalendarSheetVisible(true)} />
          ) : (
            <ActivePlanCard
              onView={() => navigation.navigate('FillActuals', { date: workingDate })}
              onEdit={() => navigation.navigate('GeneratePlan', { edit: true, date: workingDate })}
              onPreview={() => checklist && navigation.navigate('PlanDetail', { checklistId: checklist.id })}
              onDelete={() => setDeleteConfirmVisible(true)}
              isDeleting={isDeleting}
              hasProgress={hasProgress}
              supervisor={supervisorName}
              planStartTime={checklist?.planStartTime ?? null}
              completed={completedSteps}
              totalSteps={planSteps.length}
            />
          )}

          <SiteTargetCard stats={siteStats} />

          <Text style={styles.sectionHeading}>Quick Access</Text>
          <View style={styles.quickGrid}>
            <QuickAccessTile
              style={styles.quickCard}
              image={require('../../../assets/plan-history-stat.png')}
              icon={<NotebookPen size={20} color={colors.accentBlue} />}
              title="Plan history"
              subtitle="Past 12 days"
              onPress={() => navigation.navigate('PlanHistory')}
            />
            <QuickAccessTile
              style={styles.quickCard}
              image={require('../../../assets/piles-progress-stat.png')}
              icon={<Cylinder size={20} color={colors.warning} />}
              title="Piles in progress"
              subtitle={`${pilesInProgressCount} active`}
              onPress={() => navigation.navigate('FillActuals', { date: workingDate })}
            />
            <QuickAccessTile
              style={styles.quickCard}
              image={require('../../../assets/machines-stat.png')}
              icon={<Truck size={20} color={colors.success} />}
              title="Machines"
              subtitle={`${plannedMachinesCount}/${machines.length}`}
              onPress={() => navigation.navigate('SiteTab')}
            />
            <QuickAccessTile
              style={styles.quickCard}
              image={require('../../../assets/piles-stat.png')}
              icon={<Layers size={20} color={colors.accentPink} />}
              title="Piles"
              subtitle={`${siteStats.overall.completed}/${siteStats.overall.total}`}
              onPress={() => navigation.navigate('PilesTab')}
            />
          </View>

          <RecentPlanActivity plans={recentPlans} onViewAll={() => navigation.navigate('PlanHistory')} />
        </ScrollView>
      </View>

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

      <ConfirmDialog
        visible={deleteConfirmVisible}
        destructive
        title="Delete today's plan?"
        message={deleteConfirmMessage}
        confirmLabel="Delete plan"
        onCancel={() => setDeleteConfirmVisible(false)}
        onConfirm={async () => {
          if (!user?.siteId || !checklist) return;
          try {
            await deletePlan(user.siteId, checklist.id, workingDate);
            setDeleteConfirmVisible(false);
            notify.success('Plan deleted');
          } catch (err) {
            setDeleteConfirmVisible(false);
            const message =
              (err as any)?.response?.data?.detail ||
              (err instanceof Error ? err.message : 'Please try again.');
            notify.error(message, { title: 'Could not delete plan' });
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  space: { paddingVertical: spacing.sm },
  center: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { ...typography.body, color: colors.textSecondary },

  headerArea: {
    paddingHorizontal: spacing.md,
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
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.lg,
  },

  greetingBlock: {
    flex: 1,
    flexShrink: 1,
    gap: 1,
  },
  siteNameText: {
    ...typography.caption,
    color: colors.textPrimary,
  },
  helloText: {
    ...typography.h1,
    color: colors.textPrimary,
  },

  planCard: {},
  planHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  planHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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

  sectionHeading: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: -spacing.xs,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  quickCard: { width: '47.5%', flexGrow: 1 },
});