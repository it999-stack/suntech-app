// src/screens/Home/FillActualScreen.tsx
//
// Log actual start/end times against a generated pile plan.
// Groups plan+actual steps by pile (via checklistPiles from PlanContext).
// All data comes from SQLite — no server calls.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, CheckCircle2, Circle, ArrowRight, MessageSquareText } from 'lucide-react-native';
import { colors, spacing, typography } from '@theme/theme';
import { formatTime, formatMinutes } from '@utils/formatTime';
import { usePlan } from '@state/PlanContext';
import { useAuthStore } from '@store/authStore';
import PileProgressCard from '@components/plan/actual/PileProgressCard';
import { getMachinesBySite } from '@repositories/machinesRepository';
import { getPilesBySite } from '@repositories/pilesRepository';
import { getPersonnelBySite } from '@repositories/personnelRepository';
import type { PilingMachine, PilingPile, PilingPersonnel } from '@db/schema';
import type { ActualEntry } from '@app-types/plan';

/** Shape expected by PileProgressCard and PileStepsModalAdapter. */
type PileGroup = {
  checklistPileId: string;  // pilingChecklistPiles.id — used as key
  pileId: string;
  pileCode: string;
  rig: string;   // machineNo of the rig assigned
  crane: string; // machineNo of the crane assigned
  steps: ActualEntry[];
};

/** Merge plan steps + actual steps into ActualEntry shape used by existing components. */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Convert ISO timestamp to minutes-since-midnight (used by old components). */
function isoToMinutes(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  } catch {
    return undefined;
  }
}

export default function FillActualsScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const siteId = user?.siteId ?? '';
  const today = toLocalDateStr(new Date());

  const {
    checklist,
    planSteps,
    actualSteps,
    checklistPiles,
    isLoading,
    loadChecklist,
    setActualTime,
    setRemarks
  } = usePlan();

  // ── Load today's checklist on mount ────────────────────────────────────
  useEffect(() => {
    if (siteId) loadChecklist(siteId, today);
  }, [siteId, today, loadChecklist]);

  // ── Local machine + pile name lookups ───────────────────────────────────
  const [machineMap, setMachineMap] = useState<Map<string, string>>(new Map());
  const [pileMap, setPileMap] = useState<Map<string, PilingPile>>(new Map());
  const [personnelMap, setPersonnelMap] = useState<Map<string, PilingPersonnel>>(new Map());
  const [lookupsLoading, setLookupsLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return;
    setLookupsLoading(true);
    (async () => {
      const [machines, piles, personnel] = await Promise.all([
        getMachinesBySite(siteId),
        getPilesBySite(siteId),
        getPersonnelBySite(siteId),
      ]);
      setMachineMap(new Map(machines.map((m) => [m.id, m.machineNo])));
      setPileMap(new Map(piles.map((p) => [p.id, p])));
      setPersonnelMap(new Map(personnel.map((p) => [p.id, p])));
      setLookupsLoading(false);
    })();
  }, [siteId]);

  // ── Build pile groups from context data ─────────────────────────────────
  const pileGroups = useMemo((): PileGroup[] => {
    if (!checklistPiles.length) return [];

    return checklistPiles.map((cp) => {
      const pile = pileMap.get(cp.pileId);

      // Steps for this checklist-pile, merged plan + actual
      const cpPlanSteps = planSteps.filter((s) => s.checklistPileId === cp.id);
      const cpActualSteps = actualSteps.filter((a) => a.checklistPileId === cp.id);

      const steps: ActualEntry[] = cpPlanSteps.map((ps) => {
        const actual = cpActualSteps.find((a) => a.stepId === ps.stepId);
        return {
          stepId: ps.stepId,
          pileId: cp.pileId,
          pileCode: pile?.pileIdCode ?? cp.pileId,
          stepName: ps.stepName,
          track: ps.track as 'RIG' | 'CRANE',
          plannedStart: isoToMinutes(ps.plannedStart) ?? 0,
          plannedEnd: isoToMinutes(ps.plannedEnd) ?? 0,
          actualStart: isoToMinutes(actual?.actualStart ?? null),
          actualEnd: isoToMinutes(actual?.actualEnd ?? null),
          remarks: actual?.remarks ?? undefined,
        };
      });

      return {
        checklistPileId: cp.id,
        pileId: cp.pileId,
        pileCode: pile?.pileIdCode ?? cp.pileId,
        rig: machineMap.get(cp.rigId) ?? cp.rigId,
        crane: machineMap.get(cp.craneId) ?? cp.craneId,
        steps,
      };
    });
  }, [checklistPiles, planSteps, actualSteps, pileMap, machineMap]);

  // ── Modal state ─────────────────────────────────────────────────────────
  const [openCpId, setOpenCpId] = useState<string | null>(null);
  const openGroup = pileGroups.find((g) => g.checklistPileId === openCpId) ?? null;

  // ── Adapt setActualTime for the modal, which calls by stepId only ────────
  // PlanContext expects: setActualTime(checklistPileId, stepId, field, isoTimestamp)
  // We need to wrap it — the open group gives us checklistPileId.
  const handleSetActualTime = useCallback(
    (stepId: string, field: 'actualStart' | 'actualEnd', minutesSinceMidnight: number) => {
      if (!openGroup) return;
      // Convert minutes-since-midnight → ISO timestamp relative to today
      const [y, m, d] = today.split('-').map(Number);
      const dt = new Date(y, m - 1, d, Math.floor(minutesSinceMidnight / 60), minutesSinceMidnight % 60, 0, 0);
      setActualTime(openGroup.checklistPileId, stepId, field, dt.toISOString());
    },
    [openGroup, today, setActualTime],
  );

  const handleSaveRemarks = useCallback(
    (stepId: string, text: string) => {
      if (!openGroup) return;
      setRemarks(openGroup.checklistPileId, stepId, text);
    },
    [openGroup, setRemarks],
  );

  // ── Supervisor display ──────────────────────────────────────────────────
  const supervisorName = checklist?.supervisorId
    ? personnelMap.get(checklist.supervisorId)?.name ?? 'Unknown'
    : null;

  const startTimeDisplay = checklist?.planStartTime
    ? formatTime(checklist.planStartTime)
    : null;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <LinearGradient
      colors={[colors.backdropStart, colors.backdropMid, colors.backdropEnd]}
      style={styles.flex}
    >
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.headerArea}>
          <View style={styles.headerTopRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
              <ChevronLeft size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.pageTitle}>Log Actuals</Text>
            <View style={{ width: 22 }} />
          </View>
          {checklist && (
            <Text style={styles.subtitle}>
              {supervisorName ? `${supervisorName} · ` : ''}
              {startTimeDisplay ? `Started ${startTimeDisplay}` : checklist.date}
            </Text>
          )}
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {(isLoading || lookupsLoading) && (
            <ActivityIndicator
              size="large"
              color={colors.accent}
              style={{ marginTop: spacing.xxl }}
            />
          )}

          {!isLoading && !lookupsLoading && !checklist && (
            <EmptyState
              icon="calendar"
              title="No plan generated"
              message="No plan has been created for today yet."
            />
          )}

          {!isLoading && !lookupsLoading && checklist && pileGroups.length === 0 && (
            <EmptyState
              icon="layers"
              title="No piles in plan"
              message="Today's plan doesn't include any piles yet."
            />
          )}

          {!isLoading && !lookupsLoading && pileGroups.map((group) => (
            <PileProgressCard
              key={group.checklistPileId}
              pileCode={group.pileCode}
              rig={group.rig}
              crane={group.crane}
              steps={group.steps}
              onPress={() => setOpenCpId(group.checklistPileId)}
            />
          ))}
        </ScrollView>
      </SafeAreaView>

      {openGroup && (
        <PileStepsModalAdapter
          group={openGroup}
          onClose={() => setOpenCpId(null)}
          onSetActualTime={handleSetActualTime}
          onSaveRemarks={handleSaveRemarks}
        />
      )}
    </LinearGradient>
  );
}

// ─── Modal content for logging actual start/finish times per pile step ───────

import AppModal from '@components/shared/AppModal';
import StepTimeControl from '@components/plan/actual/StepTimeControl';
import RemarksModal from '@components/plan/actual/RemarksModal';
import { radius } from '@theme/theme';
import EmptyState from '@/components/shared/EmptyState';

function PileStepsModalAdapter({
  group,
  onClose,
  onSetActualTime,
  onSaveRemarks
}: {
  group: PileGroup;
  onClose: () => void;
  onSetActualTime: (stepId: string, field: 'actualStart' | 'actualEnd', minutes: number) => void;
  onSaveRemarks: (stepId: string, text: string) => void;
}) {
  // Sort steps by planned start time (oldest first)
  const steps = [...group.steps].sort((a, b) => a.plannedStart - b.plannedStart);
  // Crane steps can't start until every rig step on this pile has finished —
  // so only one step (rig, then crane) is ever "current" at a time.
  const rigSteps = steps.filter((s) => s.track === 'RIG');
  const craneSteps = steps.filter((s) => s.track === 'CRANE');
  const rigComplete = rigSteps.every((s) => s.actualEnd !== undefined);
  const currentStepId = !rigComplete
    ? rigSteps.find((s) => s.actualEnd === undefined)?.stepId
    : craneSteps.find((s) => s.actualEnd === undefined)?.stepId;
  const allDone = !currentStepId;

  // Local state for remarks editing within this modal
  const [editingRemarks, setEditingRemarks] = useState<{ stepId: string; stepName: string; value?: string } | null>(null);
  const subtitle = [group.rig && `Rig ${group.rig}`, group.crane && `Crane ${group.crane}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <AppModal visible title={group.pileCode} subtitle={subtitle || undefined} onClose={onClose}>
      {steps.map((step, idx) => {
        const isDone = step.actualEnd !== undefined;
        const isStarted = step.actualStart !== undefined;
        const isCurrent = step.stepId === currentStepId;
        const isLocked = !isDone && !isCurrent;

        return (
          <View key={step.stepId} style={modalStyles.stepRow}>
            <View style={modalStyles.markerCol}>
              {isDone ? (
                <CheckCircle2 size={20} color={colors.success} />
              ) : (
                <Circle size={20} color={isCurrent ? colors.accent : colors.textSecondary} />
              )}
              {idx < steps.length - 1 && <View style={modalStyles.markerLine} />}
            </View>

            <View style={[modalStyles.stepContent, isLocked && modalStyles.stepContentLocked]}>
              <View style={modalStyles.stepHeaderRow}>
                <Text style={modalStyles.stepName}>{step.stepName}</Text>
                <View
                  style={[
                    modalStyles.trackBadge,
                    {
                      backgroundColor:
                        step.track === 'RIG' ? colors.accentSoft : 'rgba(255,149,0,0.12)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      modalStyles.trackTag,
                      { color: step.track === 'RIG' ? colors.accent : colors.warning },
                    ]}
                  >
                    {step.track}
                  </Text>
                </View>
              </View>

              <View style={modalStyles.timeRow}>
                <Text style={modalStyles.timeText}>{formatMinutes(step.plannedStart)}</Text>
                <ArrowRight size={12} color={colors.textSecondary} style={modalStyles.timeIcon} />
                <Text style={modalStyles.timeText}>{formatMinutes(step.plannedEnd)}</Text>
              </View>

              {isDone && (
                <View style={modalStyles.timeRow}>
                  <Text style={modalStyles.loggedText}>{formatMinutes(step.actualStart!)}</Text>
                  <ArrowRight size={12} color={colors.success} style={modalStyles.timeIcon} />
                  <Text style={modalStyles.loggedText}>{formatMinutes(step.actualEnd!)}</Text>
                </View>
              )}

              {/* Show saved remarks - clickable to edit */}
              {step.remarks && step.remarks.trim().length > 0 && (
                <Pressable
                  style={modalStyles.remarksRow}
                  onPress={() => setEditingRemarks({ stepId: step.stepId, stepName: step.stepName, value: step.remarks })}
                >
                  <MessageSquareText size={14} color={colors.textSecondary} style={modalStyles.remarksIcon} />
                  <Text style={modalStyles.remarksText}>{step.remarks}</Text>
                </Pressable>
              )}

              {isCurrent && !isStarted && (
                <StepTimeControl
                  mode="start"
                  stepName={step.stepName}
                  defaultMinutes={step.plannedStart}
                  remarks={step.remarks}
                  onConfirm={(mins) => onSetActualTime(step.stepId, 'actualStart', mins)}
                  onSaveRemarks={(text) => onSaveRemarks(step.stepId, text)}
                />
              )}

              {isCurrent && isStarted && !isDone && (
                <>
                  <Text style={modalStyles.startedText}>
                    Started {formatMinutes(step.actualStart!)}
                  </Text>
                  <StepTimeControl
                    mode="finish"
                    stepName={step.stepName}
                    defaultMinutes={step.plannedEnd}
                    remarks={step.remarks}
                    onConfirm={(mins) => onSetActualTime(step.stepId, 'actualEnd', mins)}
                    onSaveRemarks={(text) => onSaveRemarks(step.stepId, text)}
                  />
                </>
              )}

              {isLocked && (
                <Text style={modalStyles.lockedText}>Waiting on previous step</Text>
              )}
            </View>
          </View>
        );
      })}

      {allDone && (
        <View style={modalStyles.allDoneWrap}>
          <CheckCircle2 size={22} color={colors.success} />
          <Text style={modalStyles.allDoneText}>
            All steps for {group.pileCode} are complete
          </Text>
        </View>
      )}

      {/* Remarks edit modal */}
      {editingRemarks && (
        <RemarksModal
          visible
          stepName={editingRemarks.stepName}
          initialValue={editingRemarks.value}
          onClose={() => setEditingRemarks(null)}
          onSave={(text) => {
            onSaveRemarks(editingRemarks.stepId, text);
            setEditingRemarks(null);
          }}
        />
      )}
    </AppModal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerArea: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: { ...typography.h2, color: colors.textPrimary, fontWeight: '700' },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});

const modalStyles = StyleSheet.create({
  stepRow: { flexDirection: 'row', marginBottom: spacing.md },
  markerCol: { alignItems: 'center', width: 24 },
  markerLine: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(28,28,46,0.1)',
    marginVertical: 3,
  },
  stepContent: { flex: 1, paddingLeft: spacing.sm },
  stepContentLocked: { opacity: 0.45 },
  stepHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepName: { ...typography.cardTitle, color: colors.textPrimary },
  trackBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  trackTag: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  plannedText: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  loggedText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.success,
    marginTop: spacing.xs,
  },
  startedText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
    marginTop: spacing.xs,
  },
  lockedText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  allDoneWrap: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  allDoneText: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  timeText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  timeIcon: {
    marginHorizontal: 4,
  },
  remarksRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.xs,
    padding: spacing.sm,
    backgroundColor: 'rgba(28,28,46,0.04)',
    borderRadius: radius.sm,
  },
  remarksIcon: {
    marginTop: 2,
  },
  remarksText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
});
