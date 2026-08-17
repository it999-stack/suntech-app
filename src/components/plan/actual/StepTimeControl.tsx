// src/components/plan/actual/StepTimeControl.tsx

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
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
import { colors, spacing, radius, typography } from '@theme/theme';

type Mode = 'start' | 'finish';

interface Props {
  mode: Mode;
  stepName: string;
  /** Sensible default minutes to seed the picker with (planned start/end). */
  defaultMinutes: number;
  /**
   * `explicitDate` is set only when the user tapped the picker's header
   * calendar and picked a day other than the seeded default — the caller
   * should use it as-is instead of running its own overnight-rollover
   * inference (see resolveOvernightDate).
   */
  onConfirm: (minutes: number, explicitDate?: Date) => void | Promise<void>;
  /** Earliest minutes-since-midnight this time may be set to (inclusive). Omit for no lower bound. */
  minMinutes?: number;
  /** Describes what minMinutes represents, used in the rejection message (e.g. "the previous step's end time"). */
  minMinutesLabel?: string;
  /**
   * Cross-pile overlap check for this step's assigned machine — called once the
   * user picks a candidate time, with the full interval that entry would create
   * on the machine's timeline (the caller closes over the step's own other bound,
   * if any — see PileStepsModal.tsx). Returns conflict info if it genuinely
   * overlaps another pile's already-recorded time on the same machine; undefined
   * if clear. Independent of minMinutes, checked by real timestamp (not
   * minutes-of-day) so a conflict on a non-adjacent calendar day still compares
   * correctly. See src/utils/machineFloor.ts.
   */
  machineConflictCheck?: (candidate: Date) => MachineConflictInfo | undefined;
  /**
   * ISO timestamp whose calendar date seeds the picker's header — the same
   * anchor handleSetActualTime resolves the final saved day from (see
   * resolveActualTimeAnchor), so the header shows the day this entry will
   * actually be attributed to instead of always device-today. Falls back to
   * today only if never provided.
   */
  anchorIso?: string;
}

export default function StepTimeControl({
  mode,
  stepName,
  defaultMinutes,
  onConfirm,
  minMinutes,
  minMinutesLabel,
  machineConflictCheck,
  anchorIso,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftMinutes, setDraftMinutes] = useState(defaultMinutes);
  const [saving, setSaving] = useState(false);

  const verb = mode === 'start' ? 'Start' : 'Finish';

  function confirm(minutes: number, explicitDate?: Date) {
    if (machineConflictCheck) {
      const candidateDate = explicitDate ?? resolveOvernightDate(anchorIso ?? toLocalIsoString(new Date()), minutes);
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
          : minutes < minMinutes;
      if (invalid) {
        Alert.alert(
          'Invalid time',
          `${verb} time can't be before ${minMinutesLabel ?? 'the required time'} (${formatMinutes12(minMinutes)}). If this step continues past midnight, tap the date above the time wheel to pick the next day.`,
        );
        return;
      }
    }

    const timeLabel = explicitDate
      ? `${formatMinutes12(minutes)} on ${formatHeaderDate(toLocalDateStr(explicitDate), { includeYear: true })}`
      : formatMinutes12(minutes);

    const title = mode === 'start' ? `Start ${stepName}?` : `Finish ${stepName}?`;
    const message =
      mode === 'start'
        ? `This will log the start time as ${timeLabel}.`
        : `Are you sure this step is complete? This will log the finish time as ${timeLabel}.`;

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        style: 'default',
        onPress: async () => {
          setSaving(true);
          try {
            await onConfirm(minutes, explicitDate);
            setPickerOpen(false);
          } catch (err) {
            Alert.alert(
              'Failed to save',
              err instanceof Error
                ? err.message
                : `Could not log the ${mode} time. Please try again.`,
            );
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  return (
    <>
        <View style={styles.wrap}>
          <Pressable
            style={[styles.actionBtn, styles.primaryBtn, saving && styles.actionBtnDisabled]}
            disabled={saving}
            onPress={() => {
              setDraftMinutes(defaultMinutes);
              setPickerOpen(true);
            }}
          >
            <Text style={styles.primaryBtnText}>{mode === 'start' ? 'Fill start time' : 'Fill finish time'}</Text>
          </Pressable>
        </View>

        <TimerSelectMenu
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onTimeSelect={(date) => {
            const m = date.getHours() * 60 + date.getMinutes();
            setDraftMinutes(m);
          }}
          onConfirm={(date, dateWasExplicit) => {
            const m = date.getHours() * 60 + date.getMinutes();
            confirm(m, dateWasExplicit ? date : undefined);
          }}
          initialDate={(() => {
            const d = anchorIso ? new Date(anchorIso) : new Date();
            d.setHours(Math.floor(defaultMinutes / 60), defaultMinutes % 60, 0, 0);
            return d;
          })()}
        />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm },
  actionBtn: {
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.5 },
  primaryBtn: { backgroundColor: colors.accent },
  primaryBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
});
