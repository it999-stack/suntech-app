// src/components/plan/actual/StepTimeControl.tsx

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import TimerSelectMenu from '@components/shared/NativeTimerSelectMenu';
import { resolveOvernightDate, toLocalIsoString } from '@utils/formatTime';
import { notify } from '@utils/notify';
import { colors, spacing, radius, typography } from '@theme/theme';

type Mode = 'start' | 'finish';

interface Props {
  mode: Mode;
  /** Sensible default minutes to seed the picker with (planned start/end). */
  defaultMinutes: number;
  /**
   * `explicitDate` is set only when the user tapped the picker's header
   * calendar and picked a day other than the seeded default — the caller
   * should use it as-is instead of running its own overnight-rollover
   * inference (see resolveOvernightDate).
   */
  onConfirm: (minutes: number, explicitDate?: Date) => void | Promise<void>;
  /**
   * Cross-pile overlap check for this step's assigned machine — returns a
   * message describing what's occupying the machine ("Machine already
   * occupied — P-02 · Casing") if the candidate time genuinely overlaps
   * another pile's already-recorded (start-and-end-both-set) interval on the
   * same machine, or null otherwise. Checked by real timestamp (not
   * minutes-of-day) so a conflict on a non-adjacent calendar day still
   * compares correctly. See src/utils/machineFloor.ts.
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
   * previous step's already-recorded end when filling a start, or this
   * step's own already-recorded start when filling a finish. Neither
   * conflict check above catches this on its own: it's an ordering
   * constraint (must not be *earlier* than a specific recorded moment), not
   * an overlap with a full interval. Omit for no lower bound.
   */
  minBoundIso?: string;
  /**
   * Earliest/latest real timestamp allowed by the checklist's own plan
   * window (plan_start_time .. plan_end_time + 1h grace) — an independent
   * outer bound from minBoundIso above (step adjacency), enforced both by
   * capping the picker's own min/max and, as a backstop, in confirm().
   * Omit for no plan-window restriction (e.g. checklist has no plan yet).
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
  defaultMinutes,
  onConfirm,
  machineConflictCheck,
  pileConflictCheck,
  minBoundIso,
  planWindowMinIso,
  planWindowMaxIso,
  anchorIso,
  blocked,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hasOpenedPicker, setHasOpenedPicker] = useState(false);
  const [draftMinutes, setDraftMinutes] = useState(defaultMinutes);
  const [saving, setSaving] = useState(false);

  async function confirm(minutes: number, explicitDate?: Date) {
    const candidateDate = explicitDate ?? resolveOvernightDate(anchorIso ?? toLocalIsoString(new Date()), minutes);

    if (minBoundIso && candidateDate.getTime() < new Date(minBoundIso).getTime()) {
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
          <Pressable
            style={[styles.actionBtn, styles.primaryBtn, saving && styles.actionBtnDisabled]}
            disabled={saving}
            onPress={() => {
              if (blocked) {
                notify.error(blocked.message, { title: blocked.title });
                return;
              }
              setDraftMinutes(defaultMinutes);
              setHasOpenedPicker(true);
              setPickerOpen(true);
            }}
          >
            <Text style={styles.primaryBtnText}>{mode === 'start' ? 'Fill start time' : 'Fill finish time'}</Text>
          </Pressable>
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
          initialDate={(() => {
            const d = anchorIso ? new Date(anchorIso) : new Date();
            d.setHours(Math.floor(defaultMinutes / 60), defaultMinutes % 60, 0, 0);
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
  wrap: { marginTop: spacing.sm },
  actionBtn: {
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.5 },
  primaryBtn: { backgroundColor: colors.accent },
  primaryBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
});
