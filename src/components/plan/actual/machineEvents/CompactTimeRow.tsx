// src/components/plan/actual/machineEvents/CompactTimeRow.tsx

import React, { useState } from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { PencilLine } from 'lucide-react-native';
import TimerSelectMenu from '@components/shared/NativeTimerSelectMenu';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import { formatTimeWithDay, toLocalIsoString } from '@utils/formatTime';
import { validateCandidateTime, IN_THE_FUTURE, type ConflictNotice } from '@utils/timeValidation';
import { notify } from '@utils/notify';

interface Props {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  /**
   * Earliest this event may have occurred — e.g. the BREAKDOWN that a RESUMED
   * closes out.
   *
   * Purely additive and fails open: when the caller can't find the opening
   * event there's simply no bound. That happens more than you'd expect,
   * because the three mount sites feed differently-scoped history — a
   * pile-scoped modal won't see a breakdown opened from another pile, while
   * the machine card will. It can therefore never reject a legitimate time,
   * only miss a wrong one.
   */
  minBoundIso?: string;
  minBoundConflict?: ConflictNotice;
  /**
   * Reject a time later than the moment of confirming. Default on — these are
   * all reports of something that already happened.
   *
   * A boolean rather than a maxBoundIso string on purpose: these modals sit
   * open while the user types notes, so a timestamp computed at render would
   * be stale by the time they pick. It's resolved against `new Date()` inside
   * the confirm handler instead.
   */
  disallowFuture?: boolean;
}

/**
 * The single time input behind every machine-event modal — breakdown, resume,
 * idle start/end, replacement, and the fleet-level Site report. Validating
 * here covers all of them: `occurredAt` can only change through this row.
 */
export default function CompactTimeRow({
  label,
  value,
  onChange,
  minBoundIso,
  minBoundConflict,
  disallowFuture = true,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  function handleConfirm(picked: Date) {
    const conflict = validateCandidateTime({
      candidateDate: picked,
      minBoundIso,
      minBoundConflict,
      maxBoundIso: disallowFuture ? toLocalIsoString(new Date()) : undefined,
      maxBoundConflict: IN_THE_FUTURE,
    });
    if (conflict) {
      // Leave `value` alone — the row keeps its last good time, so Save stays
      // usable rather than the user being stuck with a rejected entry.
      notify.error(conflict.message, { title: conflict.title });
      return;
    }
    onChange(picked);
  }

  return (
    <>
      <Pressable style={styles.row} onPress={() => setPickerOpen(true)}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.valueGroup}>
          <Text style={styles.value}>{formatTimeWithDay(toLocalIsoString(value))}</Text>
          <PencilLine size={15} color={colors.textSecondary} />
        </View>
      </Pressable>

      <TimerSelectMenu
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        initialDate={value}
        onConfirm={handleConfirm}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    ...shadow.soft,
  },
  label: { ...typography.body, color: colors.textSecondary },
  valueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  value: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
});
