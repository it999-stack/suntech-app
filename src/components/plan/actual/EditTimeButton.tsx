// src/components/plan/actual/EditTimeButton.tsx

import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { PencilLine } from 'lucide-react-native';
import TimerSelectMenu from '@components/shared/NativeTimerSelectMenu';
import { resolveOvernightDate, toLocalIsoString } from '@utils/formatTime';
import { notify } from '@utils/notify';
import { colors, radius } from '@theme/theme';

interface Props {
  /** Current value, minutes-since-midnight — seeds the picker and dialog copy. */
  minutes: number;
  /** e.g. "start time" / "finish time" — used in alert copy. */
  label: string;
  /**
   * Cross-pile overlap check for this step's assigned machine — returns a
   * message describing what's occupying the machine ("Machine already
   * occupied — P-02 · Casing") if the candidate time genuinely overlaps
   * another pile's already-recorded (start-and-end-both-set) interval on the
   * same machine, or null otherwise. Applies when editing either a start or
   * finish time. Checked by real timestamp (not minutes-of-day) so a
   * conflict on a non-adjacent calendar day still compares correctly. See
   * src/utils/machineFloor.ts.
   */
  machineConflictCheck?: (candidate: Date) => string | null;
  /**
   * Within-pile overlap check — returns a message if the candidate time
   * genuinely overlaps another step's already-recorded (start-and-end-both-set)
   * interval on this same pile, regardless of machine, or null otherwise. See
   * src/utils/machineFloor.ts.
   */
  pileConflictCheck?: (candidate: Date) => string | null;
  /**
   * Earliest real timestamp this time may land on (inclusive) — e.g. the
   * previous step's already-recorded end when editing a start, or this
   * step's own already-recorded start when editing a finish. An ordering
   * constraint, not an overlap — neither conflict check above catches it.
   * Omit for no lower bound.
   */
  minBoundIso?: string;
  /**
   * Latest real timestamp this time may land on (inclusive) — e.g. this
   * step's own already-recorded end when editing a start, or the next
   * step's already-recorded start when editing a finish. Omit for no upper
   * bound.
   */
  maxBoundIso?: string;
  /**
   * Earliest/latest real timestamp allowed by the checklist's own plan
   * window (plan_start_time .. plan_end_time + 1h grace) — an independent
   * outer bound from minBoundIso/maxBoundIso above (step adjacency),
   * enforced both by capping the picker's own min/max and, as a backstop,
   * in confirm(). Omit for no plan-window restriction (e.g. checklist has
   * no plan yet).
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
  maxBoundIso,
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

    if (minBoundIso && candidateDate.getTime() < new Date(minBoundIso).getTime()) {
      notify.error('Invalid time');
      return;
    }
    if (maxBoundIso && candidateDate.getTime() > new Date(maxBoundIso).getTime()) {
      notify.error('Invalid time');
      return;
    }

    if (planWindowMinIso && candidateDate.getTime() < new Date(planWindowMinIso).getTime()) {
      notify.error('Please select a time within the plan window.');
      return;
    }
    if (planWindowMaxIso && candidateDate.getTime() > new Date(planWindowMaxIso).getTime()) {
      notify.error('Please select a time within the plan window.');
      return;
    }

    const conflictMessage = machineConflictCheck?.(candidateDate) ?? pileConflictCheck?.(candidateDate);
    if (conflictMessage) {
      notify.error(conflictMessage);
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
        minimumDate={planWindowMinIso ? new Date(planWindowMinIso) : undefined}
        maximumDate={planWindowMaxIso ? new Date(planWindowMaxIso) : undefined}
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
