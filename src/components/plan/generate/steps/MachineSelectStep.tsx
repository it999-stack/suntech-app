// src/components/plan/generate/steps/MachineSelectStep.tsx

import { StyleSheet } from 'react-native';
import GlassCard from '@components/shared/GlassCard';
import TilePicker, { type TileSection } from '@components/shared/TilePicker';
import type { TileGroupOption } from '@components/shared/TileGroup';
import { spacing } from '@/theme/theme';
import type { PlanDraft } from '@/types/plan';
import { TRACK_META, STATUS_META, isMachinePlannable, type MachineStatus } from '@/utils/helpers';
import type { SimpleMachine } from '@screens/Home/generatePlan/useGeneratePlanData';
import type { PlanDraftActions } from '@screens/Home/generatePlan/usePlanDraft';

interface MachineSelectStepProps {
  draft: PlanDraft;
  actions: Pick<PlanDraftActions, 'toggleMachine'>;
  rigs: SimpleMachine[];
  cranes: SimpleMachine[];
}

export default function MachineSelectStep({ draft, actions, rigs, cranes }: MachineSelectStepProps) {
  function handleToggle(id: string) {
    const isRig = rigs.some((r) => r.id === id);
    actions.toggleMachine(id, isRig ? 'RIG' : 'CRANE');
  }

  function toOption(m: SimpleMachine, type: 'RIG' | 'CRANE'): TileGroupOption {
    const meta = TRACK_META[type];
    const status = m.status as MachineStatus;
    const statusMeta = STATUS_META[status];
    return {
      id: m.id,
      label: m.machineNo,
      icon: meta.icon,
      color: meta.color,
      soft: meta.soft,
      disabled: !isMachinePlannable(status),
      // Display-only here — no onPress, so it renders as a plain chip.
      // Status changes happen exclusively from the site's Machines tab.
      statusBadge: {
        text: statusMeta.label,
        color: statusMeta.color,
        soft: statusMeta.soft,
      },
    };
  }

  const rigsActiveCount = rigs.filter((r) => draft.activeRigIds.includes(r.id)).length;
  const cranesActiveCount = cranes.filter((c) => draft.activeCraneIds.includes(c.id)).length;

  const sections: TileSection[] = [
    { key: 'RIG', label: `Rigs · ${rigsActiveCount} active`, options: rigs.map((r) => toOption(r, 'RIG')) },
    { key: 'CRANE', label: `Cranes · ${cranesActiveCount} active`, options: cranes.map((c) => toOption(c, 'CRANE')) },
  ];

  const selectedIds = [...draft.activeRigIds, ...draft.activeCraneIds];

  return (
    <GlassCard innerStyle={styles.groupPad}>
      <TilePicker sections={sections} selectedIds={selectedIds} onToggle={handleToggle} columns={1} />
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  groupPad: { padding: spacing.lg },
});
