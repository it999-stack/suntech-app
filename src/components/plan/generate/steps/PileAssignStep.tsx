// src/components/plan/generate/steps/PileAssignStep.tsx
//
// Step 4 — combined pile selection + per-pile machine assignment.
// Each pile row is a card: tap the header to select/deselect,
// when selected the rig + crane chip pickers expand inline.
// Only machines that were marked active in MachineSelectStep appear as options.

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CheckCircle2, Circle, ChevronDown, ChevronUp } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import Chip from '@components/plan/generate/Chip';
import { colors, spacing, radius, typography } from '@/theme/theme';
import type { PlanDraft, PileAssignment } from '@/types/plan';

export interface EligiblePile {
  id: string;
  code: string;
  dia: number;
  depth: number;
  areaLocation?: string | null;
}

export interface SimpleMachine {
  id: string;
  machineNo: string;
}

interface PileAssignStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
  piles: EligiblePile[];
  /** Only rigs that are active (from MachineSelectStep). */
  activeRigs: SimpleMachine[];
  /** Only cranes that are active (from MachineSelectStep). */
  activeCranes: SimpleMachine[];
}

// ─── Single pile card ─────────────────────────────────────────────────────────

function PileCard({
  pile,
  selected,
  expanded,
  assignment,
  activeRigs,
  activeCranes,
  onToggleSelect,
  onToggleExpand,
  onAssign,
}: {
  pile: EligiblePile;
  selected: boolean;
  expanded: boolean;
  assignment: PileAssignment | undefined;
  activeRigs: SimpleMachine[];
  activeCranes: SimpleMachine[];
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onAssign: (field: 'rig' | 'crane', value: string) => void;
}) {
  const rigOk = !!assignment?.rig;
  const craneOk = !!assignment?.crane;
  const fullyAssigned = selected && rigOk && craneOk;

  return (
    <GlassCard style={[styles.pileCard, selected && styles.pileCardSelected]}>
      {/* Header row — tap to select/deselect */}
      <Pressable style={styles.pileHeader} onPress={onToggleSelect}>
        {selected ? (
          <CheckCircle2 size={20} color={colors.accent} />
        ) : (
          <Circle size={20} color={colors.textSecondary} />
        )}
        <View style={styles.pileInfo}>
          <Text style={[styles.pileCode, selected && styles.pileCodeActive]}>
            {pile.code}
          </Text>
          <Text style={styles.pileMeta}>
            Ø{pile.dia}mm · {pile.depth}m
            {pile.areaLocation ? ` · ${pile.areaLocation}` : ''}
          </Text>
        </View>
        {selected && (
          <Pressable onPress={onToggleExpand} hitSlop={8}>
            {expanded ? (
              <ChevronUp size={18} color={colors.textSecondary} />
            ) : (
              <ChevronDown size={18} color={colors.textSecondary} />
            )}
          </Pressable>
        )}
      </Pressable>

      {/* Assignment badges — visible when selected but collapsed */}
      {selected && !expanded && (
        <View style={styles.assignBadges}>
          <View style={[styles.badge, rigOk ? styles.badgeOk : styles.badgeMissing]}>
            <Text style={[styles.badgeText, rigOk ? styles.badgeTextOk : styles.badgeTextMissing]}>
              {rigOk
                ? `Rig ${activeRigs.find((r) => r.id === assignment?.rig)?.machineNo ?? '—'}`
                : 'Rig needed'}
            </Text>
          </View>
          <View style={[styles.badge, craneOk ? styles.badgeOk : styles.badgeMissing]}>
            <Text style={[styles.badgeText, craneOk ? styles.badgeTextOk : styles.badgeTextMissing]}>
              {craneOk
                ? `Crane ${activeCranes.find((c) => c.id === assignment?.crane)?.machineNo ?? '—'}`
                : 'Crane needed'}
            </Text>
          </View>
        </View>
      )}

      {/* Inline assign pickers — visible when selected + expanded */}
      {selected && expanded && (
        <View style={styles.assignArea}>
          <Text style={styles.assignLabel}>Rig</Text>
          <View style={styles.chipRow}>
            {activeRigs.length === 0 ? (
              <Text style={styles.noMachines}>No active rigs — go back and select rigs.</Text>
            ) : (
              activeRigs.map((r) => (
                <Chip
                  key={r.id}
                  label={r.machineNo}
                  active={assignment?.rig === r.id}
                  onPress={() => onAssign('rig', r.id)}
                />
              ))
            )}
          </View>

          <Text style={[styles.assignLabel, { marginTop: spacing.sm }]}>Crane</Text>
          <View style={styles.chipRow}>
            {activeCranes.length === 0 ? (
              <Text style={styles.noMachines}>No active cranes — go back and select cranes.</Text>
            ) : (
              activeCranes.map((c) => (
                <Chip
                  key={c.id}
                  label={c.machineNo}
                  active={assignment?.crane === c.id}
                  onPress={() => onAssign('crane', c.id)}
                />
              ))
            )}
          </View>
        </View>
      )}
    </GlassCard>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PileAssignStep({
  draft,
  onUpdate,
  piles,
  activeRigs,
  activeCranes,
}: PileAssignStepProps) {
  // Track which pile card is expanded for assignment
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleSelect(pileId: string) {
    const isSelected = draft.selectedPileIds.includes(pileId);
    if (isSelected) {
      // Deselect — remove from list and clear assignment
      const newIds = draft.selectedPileIds.filter((id) => id !== pileId);
      const newAssignments = { ...draft.assignments };
      delete newAssignments[pileId];
      onUpdate({ selectedPileIds: newIds, assignments: newAssignments });
      if (expandedId === pileId) setExpandedId(null);
    } else {
      // Select — add and auto-expand for assignment
      onUpdate({ selectedPileIds: [...draft.selectedPileIds, pileId] });
      setExpandedId(pileId);
    }
  }

  function toggleExpand(pileId: string) {
    setExpandedId((prev) => (prev === pileId ? null : pileId));
  }

  function assign(pileId: string, field: 'rig' | 'crane', value: string) {
    const current = draft.assignments[pileId] ?? { rig: '', crane: '' };
    onUpdate({
      assignments: {
        ...draft.assignments,
        [pileId]: { ...current, [field]: value },
      },
    });
  }

  const selectedCount = draft.selectedPileIds.length;
  const assignedCount = draft.selectedPileIds.filter(
    (id) => draft.assignments[id]?.rig && draft.assignments[id]?.crane,
  ).length;

  return (
    <>
      <Text style={styles.hint}>
        Tap a pile to select it, then assign a rig and crane. Only active machines appear.
      </Text>

      {selectedCount > 0 && (
        <View style={styles.progressBanner}>
          <Text style={styles.progressText}>
            {assignedCount} / {selectedCount} piles fully assigned
          </Text>
        </View>
      )}

      {piles.map((pile) => (
        <PileCard
          key={pile.id}
          pile={pile}
          selected={draft.selectedPileIds.includes(pile.id)}
          expanded={expandedId === pile.id}
          assignment={draft.assignments[pile.id]}
          activeRigs={activeRigs}
          activeCranes={activeCranes}
          onToggleSelect={() => toggleSelect(pile.id)}
          onToggleExpand={() => toggleExpand(pile.id)}
          onAssign={(field, value) => assign(pile.id, field, value)}
        />
      ))}

      {piles.length === 0 && (
        <Text style={styles.emptyText}>No piles found for this site.</Text>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  progressBanner: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  progressText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
  },
  pileCard: { marginBottom: 0 },
  pileCardSelected: { borderColor: colors.accent, borderWidth: 1.5 },
  pileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  pileInfo: { flex: 1 },
  pileCode: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pileCodeActive: { color: colors.accent },
  pileMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  assignBadges: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeOk: { backgroundColor: 'rgba(34,197,94,0.12)' },
  badgeMissing: { backgroundColor: 'rgba(239,68,68,0.10)' },
  badgeText: { ...typography.caption, fontWeight: '600' },
  badgeTextOk: { color: '#16a34a' },
  badgeTextMissing: { color: '#dc2626' },
  assignArea: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,28,46,0.08)',
    paddingTop: spacing.sm,
  },
  assignLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  noMachines: {
    ...typography.caption,
    color: colors.danger,
    fontStyle: 'italic',
  },
  emptyText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});