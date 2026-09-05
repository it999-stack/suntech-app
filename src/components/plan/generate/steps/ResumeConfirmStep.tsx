// src/components/plan/generate/steps/ResumeConfirmStep.tsx
//
// "Planned Piles" step — sits right after Piles & Assign. Acts as a
// lightweight, read-only preview of every assigned pile (grouped by rig,
// same layout as PileAssignStep's "Assigned Piles" modal — see
// pile-assign/PileGroupCard.tsx) and flags any pile with a step still in
// progress from a previous day (actualStart set, no actualEnd) that hasn't
// had its plan finish time confirmed yet. Uses GeneratePlanScreen's shared
// NextStepFab (no override needed here — unlike PileAssignStep, this step
// never swaps its footer for anything else), which is never disabled for
// this step — GeneratePlanScreen.goNext() calls this component's exposed
// focusFirstMissing() instead (same pattern as TeamAssignStep), which
// scrolls to the first unconfirmed pile and returns false to block
// navigation. This is the single place that owns resume-confirm UI;
// PileAssignStep is pure assignment and no longer touches any of this.

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { CheckCircle2, Clock, PencilLine } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@theme/theme';
import MachineBadge from '@components/shared/MachineBadge';
import { planEndTime, type PlanDraft } from '@/types/plan';
import type { PilingStep } from '@/db/schema';
import type { PlanDraftActions } from '@screens/Home/generatePlan/usePlanDraft';
import { formatTime } from '@utils/formatTime';
import { useScrollToField } from '@hooks/useScrollToField';
import { useTrackedScrollView } from '@hooks/useTrackedScrollView';
import ResumeTimeConfirmModal from './resume-confirm/ResumeTimeConfirmModal';
import { useResumeConfirmQueue, pileNeedsResumeConfirm } from './resume-confirm/useResumeConfirmQueue';
import { PileGroupCard, PileGroupRow } from './pile-assign/PileGroupCard';
import type { EligiblePile, MachineKind, SimpleMachine } from './pile-assign/types';

// Solid form of colors.accentSoft's base rgb — same indigo, full opacity, for the
// confirmed status pill's icon/text (accentSoft alone is too faint at text weight).
const ACCENT_SOLID = '#5B5FEF';

export interface ResumeConfirmStepHandle {
  /**
   * True if every pile is confirmed. If not, scrolls to and highlights the
   * first one that still needs confirmation, and returns false.
   */
  focusFirstMissing: () => boolean;
}

interface ResumeConfirmStepProps {
  draft: PlanDraft;
  actions: Pick<PlanDraftActions, 'confirmResume'>;
  piles?: EligiblePile[];
  activeRigs?: SimpleMachine[];
  activeCranes?: SimpleMachine[];
  /** Where a resume step effectively starts in the new plan — see
   * pilingPlannerService.ts's resolveEffectiveDayStart. */
  effectiveDayStart: Date;
  /** Global step catalog — passed through to useResumeConfirmQueue so a step
   * confirmed "fully completed" can be recorded with its real track/
   * sequenceOrder (see that hook's confirmFull). */
  allSteps?: PilingStep[];
}

const ResumeConfirmStep = forwardRef<ResumeConfirmStepHandle, ResumeConfirmStepProps>(function ResumeConfirmStep({
  draft, actions, piles = [], activeRigs = [], activeCranes = [],
  effectiveDayStart, allSteps = [],
}, ref) {
  const resumeConfirm = useResumeConfirmQueue(draft, actions.confirmResume, allSteps);
  const { scrollViewRef, scrollYRef, onScroll, scrollEventThrottle } = useTrackedScrollView();
  const { registerField, scrollToField } = useScrollToField(scrollViewRef, scrollYRef);

  function machineLabel(kind: MachineKind, machineId: string): string {
    return (kind === 'rig' ? activeRigs : activeCranes).find((m) => m.id === machineId)?.machineNo ?? '—';
  }

  const flaggedPileIds = useMemo(
    () => draft.selectedPileIds.filter((id) => pileNeedsResumeConfirm(draft.resumeWorkByPileId, id)),
    [draft.selectedPileIds, draft.resumeWorkByPileId],
  );

  // Every selected pile carrying a genuinely in-progress prior-day step —
  // flagged (not yet confirmed) or already confirmed — for the section's
  // progress count. Distinct from flaggedPileIds, which only ever counts
  // the not-yet-confirmed ones.
  const resumingPileIds = useMemo(
    () => draft.selectedPileIds.filter((id) => !!draft.resumeWorkByPileId[id]?.wasStarted),
    [draft.selectedPileIds, draft.resumeWorkByPileId],
  );

  // Auto-open the modal once for the first flagged pile on entry — every other
  // flagged card stays manually tappable afterward via its "Set finish time" pill.
  const autoPromptedRef = useRef(false);
  useEffect(() => {
    if (autoPromptedRef.current || flaggedPileIds.length === 0) return;
    autoPromptedRef.current = true;
    resumeConfirm.openSingle(flaggedPileIds[0]);
  }, [flaggedPileIds, resumeConfirm]);

  const rows = useMemo(() => {
    const flagged = new Set(flaggedPileIds);
    return draft.selectedPileIds
      .map((id) => piles.find((p) => p.id === id))
      .filter((p): p is EligiblePile => !!p)
      .sort((a, b) => {
        const af = flagged.has(a.id), bf = flagged.has(b.id);
        if (af !== bf) return af ? -1 : 1;
        return 0;
      });
  }, [draft.selectedPileIds, piles, flaggedPileIds]);

  const rowsByRig = useMemo(() => {
    const byRigId = new Map<string, EligiblePile[]>();
    rows.forEach((p) => {
      const rigId = draft.assignments[p.id]?.rig;
      if (!rigId) return;
      const list = byRigId.get(rigId) ?? [];
      list.push(p);
      byRigId.set(rigId, list);
    });

    const ordered = activeRigs
      .filter((r) => byRigId.has(r.id))
      .map((r) => ({ rigId: r.id, rigLabel: r.machineNo, piles: byRigId.get(r.id)! }));

    const orderedIds = new Set(activeRigs.map((r) => r.id));
    const stray = [...byRigId.entries()]
      .filter(([rigId]) => !orderedIds.has(rigId))
      .map(([rigId, list]) => ({ rigId, rigLabel: machineLabel('rig', rigId), piles: list }));

    return [...ordered, ...stray];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, draft.assignments, activeRigs]);

  useImperativeHandle(ref, () => ({
    focusFirstMissing() {
      if (flaggedPileIds.length === 0) return true;
      requestAnimationFrame(() => scrollToField(flaggedPileIds[0]));
      return false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [flaggedPileIds, scrollToField]);

  return (
    <View style={styles.root}>
      <View style={styles.listSection}>
        <ScrollView
          ref={scrollViewRef}
          onScroll={onScroll}
          scrollEventThrottle={scrollEventThrottle}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <Text style={styles.title}>Planned piles</Text>
            <Text style={styles.description}>
              {flaggedPileIds.length > 0
                ? "Piles with a step still in progress from a previous day need their status confirmed before today's plan is generated. Tap a flagged pile to confirm."
                : 'Review every pile going into today\'s plan.'}
            </Text>
            {resumingPileIds.length > 0 && (
              <Text style={styles.countText}>
                {resumingPileIds.length - flaggedPileIds.length} of {resumingPileIds.length} confirmed
              </Text>
            )}
          </View>

          {rows.length === 0 ? (
            <Text style={styles.emptyText}>No piles selected.</Text>
          ) : (
            rowsByRig.map((group) => (
              <PileGroupCard
                key={group.rigId}
                rigLabel={group.rigLabel}
                countLabel={`${group.piles.length} ${group.piles.length === 1 ? 'pile' : 'piles'}`}
              >
                {group.piles.map((p, idx) => {
                  const asgn = draft.assignments[p.id];
                  const craneLabel = asgn?.crane ? machineLabel('crane', asgn.crane) : null;
                  const needsConfirm = pileNeedsResumeConfirm(draft.resumeWorkByPileId, p.id);
                  const resumeWork = draft.resumeWorkByPileId[p.id];
                  const isConfirmed = !needsConfirm && !!resumeWork?.wasStarted;
                  // Only the small status icon carries color now (outlined-pill
                  // design) — border color follows via statusPillConfirmed/
                  // statusPillPending, text and the edit pencil stay neutral.
                  const iconColor = isConfirmed ? ACCENT_SOLID : colors.warning;

                  return (
                    <PileGroupRow
                      key={p.id}
                      rowRef={registerField(p.id)}
                      index={idx + 1}
                      title={p.code}
                      subtitle={`Ø${p.dia}mm · ${p.depth}m`}
                      isLast={idx === group.piles.length - 1}
                      right={craneLabel && <MachineBadge track="CRANE" label={craneLabel} />}
                      below={(needsConfirm || isConfirmed || resumeWork?.lastConfirmedFull) && (
                        <View style={styles.pillStack}>
                          {(needsConfirm || isConfirmed) && (
                            <Pressable
                              style={[styles.statusPill, isConfirmed ? styles.statusPillConfirmed : styles.statusPillPending]}
                              onPress={() => resumeConfirm.openSingle(p.id)}
                            >
                              <Clock size={16} color={iconColor} style={styles.statusPillIcon} />
                              {isConfirmed ? (
                                <View style={styles.statusPillTextWrap}>
                                  <Text style={styles.statusPillText} numberOfLines={1}>
                                    {resumeWork!.stepName ?? 'Step'}
                                  </Text>
                                  <Text style={styles.statusPillDetailText} numberOfLines={1}>
                                    ~{Math.floor(resumeWork!.remainingMinutes / 60)}h {resumeWork!.remainingMinutes % 60}m remaining
                                  </Text>
                                </View>
                              ) : (
                                <Text style={styles.statusPillText} numberOfLines={1}>
                                  Ready to set finish time
                                </Text>
                              )}
                              <View style={styles.statusPillEditBadge}>
                                <PencilLine size={16} color={colors.textSecondary} />
                              </View>
                            </Pressable>
                          )}
                          {resumeWork?.lastConfirmedFull && (
                            <Pressable
                              style={[styles.statusPill, styles.statusPillCompleted]}
                              onPress={() => resumeConfirm.openEditCompleted(p.id)}
                            >
                              <CheckCircle2 size={16} color={colors.success} style={styles.statusPillIcon} />
                              <View style={styles.statusPillTextWrap}>
                                <Text style={styles.statusPillText} numberOfLines={1}>
                                  {resumeWork.lastConfirmedFull.stepName}
                                </Text>
                                <Text style={styles.statusPillDetailText} numberOfLines={1}>
                                  Completed {formatTime(resumeWork.lastConfirmedFull.pastEndIso)}
                                </Text>
                              </View>
                              <View style={styles.statusPillEditBadge}>
                                <PencilLine size={16} color={colors.textSecondary} />
                              </View>
                            </Pressable>
                          )}
                        </View>
                      )}
                    />
                  );
                })}
              </PileGroupCard>
            ))
          )}
        </ScrollView>
      </View>

      {(() => {
        if (resumeConfirm.editingCompletedPileId) {
          const editPile = piles.find((p) => p.id === resumeConfirm.editingCompletedPileId);
          const editResumeWork = editPile ? draft.resumeWorkByPileId[editPile.id] : undefined;
          return editPile && editResumeWork?.lastConfirmedFull ? (
            <ResumeTimeConfirmModal
              visible
              pileCode={editPile.code}
              resumeWork={editResumeWork}
              effectiveStart={effectiveDayStart}
              onConfirmPartial={resumeConfirm.confirmPartial}
              onConfirmFull={resumeConfirm.confirmFull}
              editingCompleted
              onConfirmEditedFull={resumeConfirm.editConfirmedFull}
              todayPlanEndIso={planEndTime(draft.planStartTime)}
              onClose={resumeConfirm.cancelEditCompleted}
            />
          ) : null;
        }

        const confirmPile = piles.find((p) => p.id === resumeConfirm.confirmQueue[0]);
        const confirmResumeWork = confirmPile ? draft.resumeWorkByPileId[confirmPile.id] : undefined;
        return confirmPile && confirmResumeWork ? (
          <ResumeTimeConfirmModal
            visible={resumeConfirm.confirmQueue.length > 0}
            pileCode={confirmPile.code}
            resumeWork={confirmResumeWork}
            effectiveStart={effectiveDayStart}
            onConfirmPartial={resumeConfirm.confirmPartial}
            onConfirmFull={resumeConfirm.confirmFull}
            todayPlanEndIso={planEndTime(draft.planStartTime)}
            onClose={resumeConfirm.cancel}
          />
        ) : null;
      })()}
    </View>
  );
});

export default ResumeConfirmStep;

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  listSection: { flex: 1, minHeight: 0 },
  listContent: { paddingBottom: spacing.md },
  section: { marginBottom: spacing.md },
  title: {
    ...typography.pageTitle,
    color: colors.textPrimary,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  countText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
    marginTop: spacing.sm,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  // Outlined pill design — white fill throughout, a thin state-colored border
  // plus the leading icon are the only color, text and the edit pencil stay
  // neutral. Replaces the old filled purple/green tint pills with one
  // consistent, lower-contrast treatment across all three states.
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    backgroundColor: colors.white,
    borderWidth: 1,
  },
  pillStack: { gap: spacing.xs, marginTop: spacing.sm },
  statusPillPending: { borderColor: colors.warning },
  statusPillConfirmed: { borderColor: ACCENT_SOLID },
  statusPillCompleted: { borderColor: colors.success },
  statusPillIcon: { marginRight: spacing.xs + 2 },
  statusPillText: { ...typography.caption, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  // Wraps the confirmed/completed pills' two-line content (step name + the
  // remaining-time or completed-time detail) — a long step name used to be
  // combined with that detail into one line and truncate before the time
  // ever became visible; splitting them into their own lines means the
  // (always short) time detail is never the part that gets cut off.
  statusPillTextWrap: { flex: 1 },
  statusPillDetailText: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  statusPillEditBadge: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(28,28,46,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
});
