// src/components/plan/actual/EditTimeButton.tsx

import React, { useState } from 'react';
import { Pressable, StyleSheet, Alert } from 'react-native';
import { PencilLine } from 'lucide-react-native';
import TimerSelectMenu from '@components/shared/TimerSelectMenu';
import {
  formatMinutes12,
  formatHeaderDate,
  formatTime,
  resolveOvernightDate,
  toLocalDateStr,
  toLocalIsoString,
} from '@utils/formatTime';
import type { MachineConflictInfo } from '@utils/machineFloor';
import { colors, radius } from '@theme/theme';

interface Props {
  /** Current value, minutes-since-midnight — seeds the picker and dialog copy. */
  minutes: number;
  /** e.g. "start time" / "finish time" — used in alert copy. */
  label: string;
  /** Earliest minutes this may be changed to (inclusive). Omit for no lower bound. */
  minMinutes?: number;
  /** Describes what minMinutes represents, e.g. "the previous step's end time". */
  minMinutesLabel?: string;
  /**
   * Cross-pile overlap check for this step's assigned machine — called once the
   * user picks a candidate time, with the full interval that entry would create
   * on the machine's timeline (the caller closes over the step's own other bound
   * — see PileStepsModal.tsx). Returns conflict info if it genuinely overlaps
   * another pile's already-recorded time on the same machine; undefined if
   * clear. Applies when editing either a start or finish time. Independent of
   * minMinutes, checked by real timestamp (not minutes-of-day) so a conflict on
   * a non-adjacent calendar day still compares correctly. See
   * src/utils/machineFloor.ts.
   */
  machineConflictCheck?: (candidate: Date) => MachineConflictInfo | undefined;
  /** Latest minutes this may be changed to (inclusive). Omit for no upper bound. */
  maxMinutes?: number;
  /** Describes what maxMinutes represents, e.g. "the next step's start time". */
  maxMinutesLabel?: string;
  /**
   * `explicitDate` is set only when the user tapped the picker's header
   * calendar and picked a day other than the seeded default — the caller
   * should use it as-is instead of running its own overnight-rollover
   * inference (see resolveOvernightDate).
   */
  onConfirm: (minutes: number, explicitDate?: Date) => void | Promise<void>;
  /**
   * ISO timestamp whose calendar date seeds the picker's header — the same
   * anchor handleSetActualTime resolves the final saved day from (see
   * resolveActualTimeAnchor), so the header shows the day this entry will
   * actually be attributed to instead of always device-today. Falls back to
   * today only if never provided.
   */
  anchorIso?: string;
}

export default function EditTimeButton({
  minutes,
  label,
  minMinutes,
  minMinutesLabel,
  machineConflictCheck,
  maxMinutes,
  maxMinutesLabel,
  onConfirm,
  anchorIso,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  function confirm(newMinutes: number, explicitDate?: Date) {
    if (machineConflictCheck) {
      const candidateDate = explicitDate ?? resolveOvernightDate(anchorIso ?? toLocalIsoString(new Date()), newMinutes);
      const conflict = machineConflictCheck(candidateDate);
      if (conflict) {
        const range = conflict.end
          ? `${formatTime(conflict.start)} – ${formatTime(conflict.end)}`
          : `${formatTime(conflict.start)} onward (still in progress)`;
        Alert.alert(
          'Invalid time',
          `${conflict.machineLabel} is already logged busy with ${conflict.reasonLabel} from ${range} — this can't overlap that.`,
        );
        return;
      }
    }

    if (minMinutes != null) {
      const invalid =
        explicitDate && anchorIso
          ? explicitDate.getTime() < new Date(anchorIso).getTime()
          : newMinutes < minMinutes;
      if (invalid) {
        Alert.alert(
          'Invalid time',
          `The ${label} can't be before ${minMinutesLabel ?? 'the required time'} (${formatMinutes12(minMinutes)}). If this step continues past midnight, tap the date above the time wheel to pick the next day.`,
        );
        return;
      }
    }
    if (maxMinutes != null) {
      // maxMinutes' anchor (e.g. the next step's start) has no ISO available
      // here, so an explicit pick on a different calendar day than the seed
      // is trusted as-is; same-day picks still get the strict check.
      const sameDayAsSeed = !explicitDate || (anchorIso ? toLocalDateStr(explicitDate) === toLocalDateStr(new Date(anchorIso)) : true);
      if (sameDayAsSeed && newMinutes > maxMinutes) {
        Alert.alert(
          'Invalid time',
          `The ${label} can't be after ${maxMinutesLabel ?? 'the required time'} (${formatMinutes12(maxMinutes)}).`,
        );
        return;
      }
    }

    const timeLabel = explicitDate
      ? `${formatMinutes12(newMinutes)} on ${formatHeaderDate(toLocalDateStr(explicitDate), { includeYear: true })}`
      : formatMinutes12(newMinutes);

    Alert.alert(
      'Change time?',
      `This will change the ${label} to ${timeLabel}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: async () => {
            setSaving(true);
            try {
              await onConfirm(newMinutes, explicitDate);
              setPickerOpen(false);
            } catch (err) {
              Alert.alert(
                'Failed to save',
                err instanceof Error ? err.message : `Could not update the ${label}. Please try again.`,
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }

  return (
    <>
      <Pressable
        style={styles.btn}
        disabled={saving}
        onPress={() => setPickerOpen(true)}
        hitSlop={8}
        accessibilityLabel={`Edit ${label}`}
      >
        <PencilLine size={14} color={colors.textSecondary} />
      </Pressable>

      <TimerSelectMenu
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={(date, dateWasExplicit) => {
          const m = date.getHours() * 60 + date.getMinutes();
          confirm(m, dateWasExplicit ? date : undefined);
        }}
        initialDate={(() => {
          const d = anchorIso ? new Date(anchorIso) : new Date();
          d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
          return d;
        })()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
