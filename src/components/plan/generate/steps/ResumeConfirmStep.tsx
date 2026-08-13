// src/components/plan/generate/steps/ResumeConfirmStep.tsx
//
// "Planned Piles" step — sits right after Piles & Assign. Acts as a
// lightweight, read-only preview of every assigned pile (code + rig/crane,
// same as the Piles step) and flags any pile with a step still in progress
// from a previous day (actualStart set, no actualEnd) that hasn't had its
// plan finish time confirmed yet. Progression is blocked (see
// GeneratePlanScreen's canContinue) until every flagged pile is confirmed —
// this is the single place that owns resume-confirm UI; PileAssignStep is
// pure assignment and no longer touches any of this.
//
// Cards, not a table: this row needs to fit a pile code, two machine badges,
// AND a status pill — a 3-column IndexTable squeezes the pile-code column to
// near-zero on a phone width and wraps every character onto its own line.
// Stacking vertically inside one full-width card (mirrors PileProgressCard's
// layout) gives every element the room it needs.

import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { Clock, PencilLine } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import type { PlanDraft } from '@/types/plan';
import GlassCard from '@components/shared/GlassCard';
import ResumeTimeConfirmModal from './resume-confirm/ResumeTimeConfirmModal';
import { useResumeConfirmQueue, pileNeedsResumeConfirm } from './resume-confirm/useResumeConfirmQueue';
import type { EligiblePile, MachineKind, SimpleMachine } from './pile-assign/types';

// Solid form of colors.accentSoft's base rgb — same indigo, full opacity, for the
// confirmed status pill's icon/text (accentSoft alone is too faint at text weight).
const ACCENT_SOLID = '#5B5FEF';

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

export default function ResumeConfirmStep({
  draft, onUpdate, piles = [], activeRigs = [], activeCranes = [],
  effectiveDayStart, onContinue, continueDisabled,
}: ResumeConfirmStepProps) {
  const resumeConfirm = useResumeConfirmQueue(draft, onUpdate);

  function machineLabel(kind: MachineKind, machineId: string): string {
    return (kind === 'rig' ? activeRigs : activeCranes).find((m) => m.id === machineId)?.machineNo ?? '—';
  }

  const flaggedPileIds = useMemo(
    () => draft.selectedPileIds.filter((id) => pileNeedsResumeConfirm(draft.resumeWorkByPileId, id)),
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

  return (
    <View style={styles.root}>
      <View style={styles.listSection}>
        <FlatList
          data={rows}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.listContent}
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
                    {rigLabel && (
                      <View style={[styles.machineBadge, { backgroundColor: colors.machines.rig.soft, borderColor: colors.machines.rig.color }]}>
                        <Text style={[styles.machineBadgeText, { color: colors.machines.rig.color }]}>RIG · {rigLabel}</Text>
                      </View>
                    )}
                    {craneLabel && (
                      <View style={[styles.machineBadge, { backgroundColor: colors.machines.crane.soft, borderColor: colors.machines.crane.color }]}>
                        <Text style={[styles.machineBadgeText, { color: colors.machines.crane.color }]}>CRANE · {craneLabel}</Text>
                      </View>
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
            onConfirm={resumeConfirm.confirm}
            onClose={resumeConfirm.cancel}
          />
        ) : null;
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  listSection: { flex: 1, minHeight: 0 },
  listContent: { gap: spacing.sm, paddingBottom: spacing.md },
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
  machineRow: { flexDirection: 'column', alignItems: 'flex-end', gap: spacing.xs, flexShrink: 0 },
  machineBadge: {
    alignSelf: 'flex-end',
    borderRadius: radius.sm,
    borderWidth: 1.5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  machineBadgeText: { ...typography.caption, fontWeight: '700' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  statusPillPending: { backgroundColor: 'rgba(28,28,46,0.05)' },
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
