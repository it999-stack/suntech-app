// src/components/plan/actual/EditTimeButton.tsx

import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { PencilLine } from 'lucide-react-native';
import TimerSelectMenu from '@components/shared/NativeTimerSelectMenu';
import { resolveOvernightDate, toLocalIsoString, startOfDay, endOfDay } from '@utils/formatTime';
import { validateCandidateTime, type ConflictNotice } from '@utils/timeValidation';
import { notify } from '@utils/notify';
import { colors, radius } from '@theme/theme';

interface Props {
  /** Current value, minutes-since-midnight — seeds the picker and dialog copy. */
  minutes: number;
  /** e.g. "start time" / "finish time" — used in alert copy. */
  label: string;
  /**
   * Cross-pile overlap check for this step's assigned machine — returns a
   * "Machine occupied" notice naming what's occupying it if the candidate
   * time genuinely overlaps another pile's already-recorded
   * (start-and-end-both-set) interval on the same machine, or null
   * otherwise. Applies when editing either a start or finish time. Checked
   * by real timestamp (not minutes-of-day) so a conflict on a non-adjacent
   * calendar day still compares correctly. See src/utils/machineFloor.ts.
   */
  machineConflictCheck?: (candidate: Date) => ConflictNotice | null;
  /**
   * Within-pile overlap check — returns a notice if the candidate time
   * genuinely overlaps another step's already-recorded (start-and-end-both-set)
   * interval on this same pile, regardless of machine, or null otherwise. See
   * src/utils/machineFloor.ts.
   */
  pileConflictCheck?: (candidate: Date) => ConflictNotice | null;
  /**
   * Earliest real timestamp this time may land on (inclusive) — e.g. the
   * previous step's already-recorded end when editing a start, or this
   * step's own already-recorded start when editing a finish. An ordering
   * constraint, not an overlap — neither conflict check above catches it.
   * Omit for no lower bound.
   */
  minBoundIso?: string;
  /** What's occupying minBoundIso, for the rejection notice. Omit to fall
   * back to a bare "Invalid time" for this bound. See
   * src/utils/timeValidation.ts. */
  minBoundConflict?: ConflictNotice;
  /**
   * Latest real timestamp this time may land on (inclusive) — e.g. this
   * step's own already-recorded end when editing a start, or the next
   * step's already-recorded start when editing a finish. Omit for no upper
   * bound.
   */
  maxBoundIso?: string;
  /** What's occupying maxBoundIso, for the rejection notice. Omit to fall
   * back to a bare "Invalid time" for this bound. */
  maxBoundConflict?: ConflictNotice;
  /**
   * Earliest/latest real timestamp allowed by the checklist's own plan
   * window (plan_start_time .. plan_end_time + 1h grace) — an independent
   * outer bound from minBoundIso/maxBoundIso above (step adjacency). The
   * picker itself only loosely bounds by whole calendar day (see
   * startOfDay/endOfDay below) so it never auto-snaps mid-scroll; the exact
   * cutoff is enforced solely by the notify.error backstop in confirm().
   * Omit for no plan-window restriction (e.g. checklist has no plan yet).
   */
  planWindowMinIso?: string;
  planWindowMaxIso?: string;
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
  /** When set, tapping the pencil shows this toast instead of opening the
   * time picker — e.g. the step's assigned machine is reported down. */
  blocked?: { title: string; message: string };
}

export default function EditTimeButton({
  minutes,
  label,
  machineConflictCheck,
  pileConflictCheck,
  minBoundIso,
  minBoundConflict,
  maxBoundIso,
  maxBoundConflict,
  planWindowMinIso,
  planWindowMaxIso,
  onConfirm,
  anchorIso,
  blocked,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hasOpenedPicker, setHasOpenedPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  async function confirm(newMinutes: number, explicitDate?: Date) {
    const candidateDate = explicitDate ?? resolveOvernightDate(anchorIso ?? toLocalIsoString(new Date()), newMinutes);

    const conflict = validateCandidateTime({
      candidateDate,
      minBoundIso,
      minBoundConflict,
      maxBoundIso,
      maxBoundConflict,
      planWindowMinIso,
      planWindowMaxIso,
      machineConflictCheck,
      pileConflictCheck,
    });
    if (conflict) {
      notify.error(conflict.message, { title: conflict.title });
      return;
    }

    setSaving(true);
    try {
      await onConfirm(newMinutes, explicitDate);
      setPickerOpen(false);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : `Could not update the ${label}. Please try again.`, {
        title: 'Failed to save',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Pressable
        style={styles.btn}
        disabled={saving}
        onPress={() => {
          if (blocked) {
            notify.error(blocked.message, { title: blocked.title });
            return;
          }
          setHasOpenedPicker(true);
          setPickerOpen(true);
        }}
        hitSlop={8}
        accessibilityLabel={`Edit ${label}`}
      >
        <PencilLine size={14} color={colors.textSecondary} />
      </Pressable>

      {hasOpenedPicker && (
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
        minimumDate={planWindowMinIso ? startOfDay(new Date(planWindowMinIso)) : undefined}
        maximumDate={planWindowMaxIso ? endOfDay(new Date(planWindowMaxIso)) : undefined}
      />
      )}
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
