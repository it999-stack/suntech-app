// src/components/plan/actual/StepTimeControl.tsx

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Play, Flag } from 'lucide-react-native';
import TimerSelectMenu from '@components/shared/NativeTimerSelectMenu';
import Button from '@components/shared/Button';
import { resolveOvernightDate, toLocalIsoString, startOfDay, endOfDay, seedPickerDate } from '@utils/formatTime';
import { validateCandidateTime, type ConflictNotice } from '@utils/timeValidation';
import { notify } from '@utils/notify';
import { spacing } from '@theme/theme';

type Mode = 'start' | 'finish';

interface Props {
  mode: Mode;
  /**
   * What the picker opens on, as minutes-since-midnight. A thunk, not a
   * value: the finish seed falls back to "now" once a step has overrun its
   * plan, and this modal can sit open for minutes — so it's resolved when the
   * picker actually opens rather than at whenever the last render happened.
   * See buildActualTimeRules.
   */
  getDefaultMinutes: () => number;
  /**
   * `explicitDate` is set only when the user tapped the picker's header
   * calendar and picked a day other than the seeded default — the caller
   * should use it as-is instead of running its own overnight-rollover
   * inference (see resolveOvernightDate).
   */
  onConfirm: (minutes: number, explicitDate?: Date) => void | Promise<void>;
  /**
   * Cross-pile overlap check for this step's assigned machine — returns a
   * "Machine occupied" notice naming what's occupying it if the candidate
   * time genuinely overlaps another pile's already-recorded
   * (start-and-end-both-set) interval on the same machine, or null
   * otherwise. Checked by real timestamp (not minutes-of-day) so a conflict
   * on a non-adjacent calendar day still compares correctly. See
   * src/utils/machineFloor.ts.
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
   * previous step's already-recorded end when filling a start, or this
   * step's own already-recorded start when filling a finish. Neither
   * conflict check above catches this on its own: it's an ordering
   * constraint (must not be *earlier* than a specific recorded moment), not
   * an overlap with a full interval. Omit for no lower bound.
   */
  minBoundIso?: string;
  /** What's occupying minBoundIso, for the rejection notice. Omit to fall
   * back to a bare "Invalid time" for this bound. See
   * src/utils/timeValidation.ts. */
  minBoundConflict?: ConflictNotice;
  /**
   * Latest real timestamp this time may land on (inclusive) — the mirror of
   * minBoundIso. In fill mode this is normally undefined (a step being
   * started has no recorded end yet), but it's declared so the shared rule
   * bag from buildActualTimeRules can be spread wholesale into both this and
   * EditTimeButton without a bound silently vanishing.
   */
  maxBoundIso?: string;
  maxBoundConflict?: ConflictNotice;
  /**
   * Earliest/latest real timestamp allowed by the checklist's own plan
   * window (plan_start_time .. plan_end_time) — an independent
   * outer bound from minBoundIso above (step adjacency). The picker itself
   * only loosely bounds by whole calendar day (see startOfDay/endOfDay
   * below) so it never auto-snaps mid-scroll; the exact cutoff is enforced
   * solely by the notify.error backstop in confirm(). Omit for no
   * plan-window restriction (e.g. checklist has no plan yet).
   */
  planWindowMinIso?: string;
  planWindowMaxIso?: string;
  /**
   * ISO timestamp whose calendar date seeds the picker's header — the same
   * anchor handleSetActualTime resolves the final saved day from (see
   * resolveActualTimeAnchor), so the header shows the day this entry will
   * actually be attributed to instead of always device-today. Falls back to
   * today only if never provided.
   */
  anchorIso?: string;
  /** When set, tapping the fill button shows this toast instead of opening
   * the time picker — e.g. the step's assigned machine is reported down. */
  blocked?: { title: string; message: string };
}

export default function StepTimeControl({
  mode,
  getDefaultMinutes,
  onConfirm,
  machineConflictCheck,
  pileConflictCheck,
  minBoundIso,
  minBoundConflict,
  maxBoundIso,
  maxBoundConflict,
  planWindowMinIso,
  planWindowMaxIso,
  anchorIso,
  blocked,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hasOpenedPicker, setHasOpenedPicker] = useState(false);
  const [draftMinutes, setDraftMinutes] = useState(getDefaultMinutes);
  const [saving, setSaving] = useState(false);

  async function confirm(minutes: number, explicitDate?: Date) {
    const candidateDate = explicitDate ?? resolveOvernightDate(anchorIso ?? toLocalIsoString(new Date()), minutes);

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
      await onConfirm(minutes, explicitDate);
      setPickerOpen(false);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : `Could not log the ${mode} time. Please try again.`, {
        title: 'Failed to save',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
        <View style={styles.wrap}>
          <Button
            label={mode === 'start' ? 'Fill start time' : 'Fill finish time'}
            icon={mode === 'start' ? Play : Flag}
            disabled={saving}
            onPress={() => {
              if (blocked) {
                notify.error(blocked.message, { title: blocked.title });
                return;
              }
              // Resolved here, not at render — see getDefaultMinutes.
              setDraftMinutes(getDefaultMinutes());
              setHasOpenedPicker(true);
              setPickerOpen(true);
            }}
          />
        </View>

        {hasOpenedPicker && (
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
          // draftMinutes, not getDefaultMinutes() — the picker must open on
          // the value captured when it opened, or re-rendering while it's up
          // would move the wheel under the user.
          initialDate={seedPickerDate(anchorIso, draftMinutes)}
          minimumDate={planWindowMinIso ? startOfDay(new Date(planWindowMinIso)) : undefined}
          maximumDate={planWindowMaxIso ? endOfDay(new Date(planWindowMaxIso)) : undefined}
        />
        )}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm },
});
