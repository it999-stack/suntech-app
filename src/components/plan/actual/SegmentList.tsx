// src/components/plan/actual/SegmentList.tsx
//
// A step's work sessions, one CARD each. Shown in place of the single
// "Actual start / Actual end" pair once a step has been split between
// machines — that pair can't express two machines' separate spans, and
// collapsing them is exactly what mis-credits the machine that left.
//
// Only rendered when a step actually has sessions. An ordinary never-split
// step keeps the original rows, so the common case looks unchanged.

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MessageSquarePlus, Trash2 } from 'lucide-react-native';
import Button from '@components/shared/Button';
import MachineBadge from '@components/shared/MachineBadge';
import EditTimeButton from '@components/plan/actual/EditTimeButton';
import RemarksModal from '@components/plan/actual/RemarksModal';
import ConfirmDialog from '@components/shared/ConfirmDialog';
import { colors, spacing, radius, typography } from '@theme/theme';
// Same helper every other actual time on this screen uses (Actual start /
// Actual end above this list) — a session card reading a different format
// from the rows right above it would make the two look unrelated.
import { formatTimeWithDay } from '@utils/formatTime';
import { notify } from '@utils/notify';
import { workedMinutes } from '@services/stepSegments';
import type { ActualTimeRules } from '@utils/actualTimeRules';
import type { ActualEntry, ActualSegment } from '@app-types/plan';

const STOP_REASON_LABEL: Record<NonNullable<ActualSegment['stopReason']>, string> = {
  SHIFT_CHANGE: 'Shift change',
  BREAKDOWN: 'Breakdown',
  IDLE: 'Idle',
  OTHER: 'Stopped',
};

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function segmentDurationMinutes(seg: ActualSegment): number | null {
  if (!seg.endedAt) return null;
  return Math.max(0, Math.round((new Date(seg.endedAt).getTime() - new Date(seg.startedAt).getTime()) / 60000));
}

/** ISO timestamp -> minutes-since-midnight, to seed EditTimeButton's picker. */
function minutesOf(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

interface Props {
  step: ActualEntry;
  /** This pile's whole rule set — forSegment is scoped per (stepId,
   * segmentId, field) inside, same builder the roll-up's own Edit controls
   * above this list already spread from. Omitted alongside the two handlers
   * below for a historical (previous-day) row, which is read-only. */
  rules?: ActualTimeRules;
  onEditSegmentTime?: (
    segmentId: string,
    field: 'start' | 'finish',
    minutes: number,
    explicitDate?: Date,
  ) => void | Promise<void>;
  /** Free-text note on one session — the segment-scoped counterpart to the
   * step-level Remarks button above this list (see PileStepsModal). */
  onSetSegmentNotes?: (segmentId: string, notes: string) => void | Promise<void>;
  onDeleteSegment?: (segmentId: string) => void | Promise<void>;
}

export default function SegmentList({ step, rules, onEditSegmentTime, onSetSegmentNotes, onDeleteSegment }: Props) {
  const segments = step.segments ?? [];
  const [pendingDelete, setPendingDelete] = useState<ActualSegment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [remarksFor, setRemarksFor] = useState<ActualSegment | null>(null);

  if (!segments.length) return null;

  const worked = workedMinutes(segments, {
    actualStartIso: step.actualStartIso,
    actualEndIso: step.actualEndIso,
  });
  // Only from the LAST session, and only while paused — a step that was paused
  // and later finished must not still advertise work remaining.
  const last = segments[segments.length - 1];
  const remaining = step.status === 'PAUSED' ? last.remainingMinutes : undefined;

  async function handleConfirmDelete() {
    if (!pendingDelete || !onDeleteSegment) return;
    setDeleting(true);
    try {
      await onDeleteSegment(pendingDelete.id);
      setPendingDelete(null);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Could not remove the work session.', {
        title: 'Failed to remove',
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Work sessions</Text>
        {worked != null && (
          <Text style={styles.totalText}>
            Total worked {formatDuration(worked)}
            {remaining != null ? ` · ${remaining} min remaining` : ''}
          </Text>
        )}
      </View>

      {segments.map((seg) => {
        const open = !seg.endedAt;
        const durationMin = segmentDurationMinutes(seg);
        const segRules = rules?.forSegment(step.stepId, seg.id, 'start');
        const segFinishRules = rules?.forSegment(step.stepId, seg.id, 'finish');

        return (
          <View key={seg.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <MachineBadge track={step.track} label={seg.assignedMachineNo ?? '—'} />
              <Text style={[styles.durationText, open && styles.durationTextRunning]}>
                {open ? 'Running' : durationMin != null ? formatDuration(durationMin) : '—'}
              </Text>
            </View>

            <View style={styles.timeRow}>
              <View style={styles.timeBlock}>
                <Text style={styles.timeLabel}>Start</Text>
                <Text style={styles.timeValue}>{formatTimeWithDay(seg.startedAt)}</Text>
              </View>
              {/* Correcting an already-recorded time — never for filling a
                  blank one, which is what the Stop work / Resume work sheets
                  are for. A session's start always has a value (the column is
                  required), so this is always offered once editing is on. */}
              {onEditSegmentTime && segRules && (
                <EditTimeButton
                  {...segRules}
                  minutes={minutesOf(seg.startedAt)}
                  label="session start"
                  onConfirm={(minutes, explicitDate) =>
                    onEditSegmentTime(seg.id, 'start', minutes, explicitDate)
                  }
                />
              )}
            </View>

            <View style={styles.divider} />

            <View style={styles.timeRow}>
              <View style={styles.timeBlock}>
                <Text style={styles.timeLabel}>End</Text>
                {open ? (
                  <Text style={[styles.timeValue, styles.timeValueRunning]}>Running</Text>
                ) : (
                  <Text style={styles.timeValue}>{formatTimeWithDay(seg.endedAt)}</Text>
                )}
              </View>
              <View style={styles.timeRowActions}>
                {onEditSegmentTime && segFinishRules && !open && (
                  <EditTimeButton
                    {...segFinishRules}
                    minutes={minutesOf(seg.endedAt as string)}
                    label="session end"
                    onConfirm={(minutes, explicitDate) =>
                      onEditSegmentTime(seg.id, 'finish', minutes, explicitDate)
                    }
                  />
                )}
                {onDeleteSegment && (
                  <Pressable
                    onPress={() => setPendingDelete(seg)}
                    hitSlop={10}
                    style={styles.deleteBtn}
                    accessibilityLabel={`Remove work session starting ${formatTimeWithDay(seg.startedAt)}`}
                  >
                    <Trash2 size={16} color={colors.danger} />
                  </Pressable>
                )}
              </View>
            </View>

            {seg.stopReason && <Text style={styles.reasonText}>{STOP_REASON_LABEL[seg.stopReason]}</Text>}

            {(seg.notes || onSetSegmentNotes) && (
              <>
                <View style={styles.divider} />
                <View style={styles.remarksSection}>
                  <View style={styles.remarksHeaderRow}>
                    <Text style={styles.timeLabel}>Remarks</Text>
                    {onSetSegmentNotes && (
                      <Button
                        label="Remarks"
                        icon={MessageSquarePlus}
                        variant="secondary"
                        size="sm"
                        onPress={() => setRemarksFor(seg)}
                      />
                    )}
                  </View>
                  <Text style={styles.notesValue} numberOfLines={3}>
                    {seg.notes || 'No remarks'}
                  </Text>
                </View>
              </>
            )}
          </View>
        );
      })}

      {pendingDelete && (
        <ConfirmDialog
          visible
          title="Remove work session"
          message={`Remove the session on ${pendingDelete.assignedMachineNo ?? 'this machine'} starting ${formatTimeWithDay(pendingDelete.startedAt)}? This can't be undone.`}
          confirmLabel="Remove"
          destructive
          confirmDisabled={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {remarksFor && (
        <RemarksModal
          visible
          // RemarksModal's "stepName" is just a display subtitle — a step can
          // have several sessions, so it has to name THIS one (machine + when
          // it started), or the modal would be indistinguishable from the
          // step-level Remarks button above this list.
          stepName={`${step.stepName} — ${remarksFor.assignedMachineNo ?? 'session'}, ${formatTimeWithDay(remarksFor.startedAt)}`}
          initialValue={remarksFor.notes}
          onClose={() => setRemarksFor(null)}
          onSave={(text) => onSetSegmentNotes?.(remarksFor.id, text)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  heading: {
    ...typography.smallTxt,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  totalText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },

  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  durationText: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  durationTextRunning: { color: colors.accentBlue },

  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  timeRowActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  timeBlock: { gap: 2, flex: 1 },
  timeLabel: { ...typography.caption, color: colors.textSecondary },
  timeValue: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  timeValueRunning: { color: colors.accentBlue },
  notesValue: { ...typography.caption, color: colors.textPrimary },
  remarksSection: { gap: 4 },
  remarksHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  divider: { height: 1, backgroundColor: colors.border },
  deleteBtn: { padding: 2 },

  reasonText: { ...typography.smallTxt, color: colors.warning },
});
