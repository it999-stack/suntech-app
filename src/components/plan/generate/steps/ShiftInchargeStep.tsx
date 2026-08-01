// src/components/plan/generate/steps/ShiftInchargeStep.tsx
//
// One person per shift (Shift 1/Day, Shift 2/Night) — same two-Accordion UI
// shell as the original SupervisorStep this file was renamed from, now
// filtered to the "Shift Incharge" designation and writing into
// draft.checklistPersonnel (the "Supervisor" role moved to TeamAssignStep,
// where it's paired 1 rig + 1 crane per supervisor instead of per shift).

import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import Accordion from '@components/shared/Accordion';
import PersonnelPickerList, { type SimplePersonnel } from '@components/shared/PersonnelPickerList';
import { colors, spacing, typography } from '@/theme/theme';
import type { PlanDraft } from '@/types/plan';
import { matchesRoleDesignation } from '@/utils/personnelRoles';

export interface SimpleShift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

interface ShiftInchargeStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
  personnel: SimplePersonnel[];
  shifts: SimpleShift[];
}

export default function ShiftInchargeStep({
  draft,
  onUpdate,
  personnel,
  shifts,
}: ShiftInchargeStepProps) {
  const shiftIncharges = useMemo(
    () => personnel.filter((p) => matchesRoleDesignation('SHIFT_INCHARGE', p.designation)),
    [personnel],
  );

  const shift1 = shifts[0];
  const shift2 = shifts[1];

  const slot1Label = shift1
    ? `${shift1.name} · ${shift1.startTime} – ${shift1.endTime}`
    : 'Shift 1 (Day)';
  const slot2Label = shift2
    ? `${shift2.name} · ${shift2.startTime} – ${shift2.endTime}`
    : 'Shift 2 (Night)';

  return (
    <>
      <Text style={styles.hint}>
        Assign a shift incharge for each shift. Both are optional.
      </Text>

      <Accordion defaultOpen header={<Text style={styles.slotLabel}>{slot1Label}</Text>}>
        <PersonnelPickerList
          personnel={shiftIncharges}
          selectedId={draft.checklistPersonnel.shiftInchargeId}
          onSelect={(id) =>
            onUpdate({ checklistPersonnel: { ...draft.checklistPersonnel, shiftInchargeId: id } })
          }
        />
      </Accordion>

      <Accordion defaultOpen header={<Text style={styles.slotLabel}>{slot2Label}</Text>}>
        <PersonnelPickerList
          personnel={shiftIncharges}
          selectedId={draft.checklistPersonnel.shiftInchargeId2}
          onSelect={(id) =>
            onUpdate({ checklistPersonnel: { ...draft.checklistPersonnel, shiftInchargeId2: id } })
          }
        />
      </Accordion>
    </>
  );
}

const styles = StyleSheet.create({
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  slotLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
