// src/components/plan/actual/StepTimeControl.tsx

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import TimerSelectMenu from '@components/shared/TimerSelectMenu';
import ConfirmDialog from '@components/shared/ConfirmDialog';
import {
  formatMinutes12,
  formatHeaderDate,
  resolveOvernightDate,
  toLocalDateStr,
  toLocalIsoString,
} from '@utils/formatTime';
import { notify } from '@utils/notify';
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
  /**
   * Cross-pile overlap check for this step's assigned machine — true if the
   * candidate time genuinely overlaps another pile's already-recorded
   * (start-and-end-both-set) interval on the same machine. Checked by real
   * timestamp (not minutes-of-day) so a conflict on a non-adjacent calendar
   * day still compares correctly. See src/utils/machineFloor.ts.
   */
  machineConflictCheck?: (candidate: Date) => boolean;
  /**
   * Within-pile overlap check — true if the candidate time genuinely
   * overlaps another step's already-recorded (start-and-end-both-set)
   * interval on this same pile, regardless of machine. See
   * src/utils/machineFloor.ts.
   */
  pileConflictCheck?: (candidate: Date) => boolean;
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
  machineConflictCheck,
  pileConflictCheck,
  minBoundIso,
  anchorIso,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftMinutes, setDraftMinutes] = useState(defaultMinutes);
  const [saving, setSaving] = useState(false);
  const [pendingChange, setPendingChange] = useState<{
    minutes: number;
    explicitDate?: Date;
    title: string;
    message: string;
  } | null>(null);

  function confirm(minutes: number, explicitDate?: Date) {
    const candidateDate = explicitDate ?? resolveOvernightDate(anchorIso ?? toLocalIsoString(new Date()), minutes);

    if (minBoundIso && candidateDate.getTime() < new Date(minBoundIso).getTime()) {
      notify.error('Invalid time');
      return;
    }

    if (machineConflictCheck?.(candidateDate) || pileConflictCheck?.(candidateDate)) {
      notify.error('Invalid time');
      return;
    }

    const timeLabel = explicitDate
      ? `${formatMinutes12(minutes)} on ${formatHeaderDate(toLocalDateStr(explicitDate), { includeYear: true })}`
      : formatMinutes12(minutes);

    const title = mode === 'start' ? `Start ${stepName}?` : `Finish ${stepName}?`;
    const message =
      mode === 'start'
        ? `This will log the start time as ${timeLabel}.`
        : `Are you sure this step is complete? This will log the finish time as ${timeLabel}.`;

    setPendingChange({ minutes, explicitDate, title, message });
  }

  async function handleConfirmChange() {
    if (!pendingChange) return;
    const { minutes, explicitDate } = pendingChange;
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
      setPendingChange(null);
    }
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

        <ConfirmDialog
          visible={!!pendingChange}
          title={pendingChange?.title ?? ''}
          message={pendingChange?.message ?? ''}
          confirmLabel="Confirm"
          confirmDisabled={saving}
          onConfirm={handleConfirmChange}
          onCancel={() => setPendingChange(null)}
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
