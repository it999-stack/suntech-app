// src/components/plan/generate/steps/ResumeConfirmStep.tsx
//
// "Planned Piles" step — sits right after Piles & Assign. Acts as a
// lightweight, read-only preview of every assigned pile (code + rig/crane,
// same as the Piles step) and flags any pile with a step still in progress
// from a previous day (actualStart set, no actualEnd) that hasn't had its
// plan finish time confirmed yet. The Continue button is never disabled for
// this — GeneratePlanScreen.goNext() calls this component's exposed
// focusFirstMissing() instead (same pattern as TeamAssignStep), which
// scrolls to the first unconfirmed pile and returns false to block
// navigation; each unconfirmed pile also carries a persistent required-style
// left border (see StartTimeStep.tsx's PM/PE cards) the whole time it's
// unconfirmed. This is the single place that owns resume-confirm UI;
// PileAssignStep is pure assignment and no longer touches any of this.
//
// Cards, not a table: this row needs to fit a pile code, two machine badges,
// layout) gives every element the room it needs.

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { Clock, PencilLine } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import MachineBadge from '@components/shared/MachineBadge';
import type { PlanDraft } from '@/types/plan';
import GlassCard from '@components/shared/GlassCard';
import ResumeTimeConfirmModal from './resume-confirm/ResumeTimeConfirmModal';
import { useResumeConfirmQueue, pileNeedsResumeConfirm } from './resume-confirm/useResumeConfirmQueue';
import type { EligiblePile, MachineKind, SimpleMachine } from './pile-assign/types';

// Solid form of colors.accentSoft's base rgb — same indigo, full opacity, for the
// confirmed status pill's icon/text (accentSoft alone is too faint at text weight).
const ACCENT_SOLID = '#5B5FEF';


export interface ResumeConfirmStepHandle {
  /**
   * True if every pile is confirmed. If not, scrolls to and (via the card's
   * always-on required border) highlights the first one that still needs
   * confirmation, and returns false.
   */
  focusFirstMissing: () => boolean;
}

interface ResumeConfirmStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
  piles?: EligiblePile[];
  activeRigs?: SimpleMachine[];
  activeCranes?: SimpleMachine[];
  /** Where a resume step effectively starts in the new plan — see
   * pilingPlannerService.ts's resolveEffectiveDayStart. */
  effectiveDayStart: Date;
  onContinue: () => void;
  continueDisabled: boolean;
}

const ResumeConfirmStep = forwardRef<ResumeConfirmStepHandle, ResumeConfirmStepProps>(function ResumeConfirmStep({
  draft, onUpdate, piles = [], activeRigs = [], activeCranes = [],
  effectiveDayStart, onContinue, continueDisabled,
}, ref) {
  const resumeConfirm = useResumeConfirmQueue(draft, onUpdate);
  const flatListRef = useRef<FlatList<EligiblePile>>(null);

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
        return a.code.localeCompare(b.code);
      });
  }, [draft.selectedPileIds, piles, flaggedPileIds]);

  useImperativeHandle(ref, () => ({
    focusFirstMissing() {
      if (flaggedPileIds.length === 0) return true;
      const index = rows.findIndex((p) => p.id === flaggedPileIds[0]);
      if (index >= 0) {
        flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
      }
      return false;
    },
  }), [flaggedPileIds, rows]);

  return (
    <View style={styles.root}>
      <View style={styles.listSection}>
        <FlatList
          ref={flatListRef}
          data={rows}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.listContent}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
            }, 50);
          }}
          ListHeaderComponent={
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
          }
          ListEmptyComponent={<Text style={styles.emptyText}>No piles selected.</Text>}
          renderItem={({ item: p }) => {
            const asgn = draft.assignments[p.id];
            const rigLabel = asgn?.rig ? machineLabel('rig', asgn.rig) : null;
            const craneLabel = asgn?.crane ? machineLabel('crane', asgn.crane) : null;
            const needsConfirm = pileNeedsResumeConfirm(draft.resumeWorkByPileId, p.id);
            const resumeWork = draft.resumeWorkByPileId[p.id];
            const isConfirmed = !needsConfirm && !!resumeWork?.wasStarted;
            const statusColor = isConfirmed ? ACCENT_SOLID : colors.textSecondary;

            return (
              <GlassCard style={styles.card} innerStyle={styles.cardInner}>
                <View style={styles.topRow}>
                  <View style={styles.pileInfo}>
                    <Text style={styles.code}>{p.code}</Text>
                    <Text style={styles.spec}>Ø{p.dia}mm · {p.depth}m</Text>
                  </View>
                  <View style={styles.machineRow}>
                    {rigLabel && <MachineBadge track="RIG" label={rigLabel} />}
                    {craneLabel ? (
                      <MachineBadge track="CRANE" label={craneLabel} />
                    ) : (
                      rigLabel && <MachineBadge track="RIG" label="Rig only" muted />
                    )}
                  </View>
                </View>

                {(needsConfirm || isConfirmed) && (
                  <Pressable
                    style={[styles.statusPill, isConfirmed ? styles.statusPillConfirmed : styles.statusPillPending]}
                    onPress={() => resumeConfirm.openSingle(p.id)}
                  >
                    <Clock size={16} color={statusColor} style={styles.statusPillIcon} />
                    <Text style={[styles.statusPillText, { color: statusColor }]} numberOfLines={1}>
                      {isConfirmed
                        ? `${resumeWork!.stepName ?? 'Step'} · ~${Math.floor(resumeWork!.remainingMinutes / 60)}h ${resumeWork!.remainingMinutes % 60}m remaining`
                        : 'Ready to set finish time'}
                    </Text>
                    <View style={styles.statusPillEditBadge}>
                      <PencilLine size={16} color={statusColor} />
                    </View>
                  </Pressable>
                )}
              </GlassCard>
            );
          }}
        />
      </View>

      <View style={styles.footer}>
        <Pressable
          disabled={continueDisabled}
          onPress={onContinue}
          style={[styles.continueBtn, continueDisabled && styles.continueBtnDisabled]}
        >
          <Text style={styles.continueText}>Continue</Text>
        </Pressable>
      </View>

      {(() => {
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
  listContent: { gap: spacing.sm, paddingBottom: spacing.md },
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
  card: { width: '100%', alignSelf: 'stretch' },
  cardInner: { padding: spacing.md },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  pileInfo: { flex: 1 },
  code: { ...typography.cardTitle, color: colors.textPrimary },
  spec: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  machineRow: { flexDirection: 'column', alignItems: 'flex-start', gap: spacing.xs, flexShrink: 0 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  statusPillPending: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.warning },
  statusPillConfirmed: { backgroundColor: colors.accentSoft },
  statusPillIcon: { marginRight: spacing.xs + 2 },
  statusPillText: { ...typography.caption, fontWeight: '600', flex: 1 },
  statusPillEditBadge: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  footer: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,28,46,0.08)',
  },
  continueBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...shadow.soft,
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueText: { ...typography.body, fontWeight: '700', color: colors.white },
});
