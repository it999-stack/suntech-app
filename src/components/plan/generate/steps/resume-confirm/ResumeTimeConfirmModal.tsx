// src/components/plan/generate/steps/resume-confirm/ResumeTimeConfirmModal.tsx
//
// Gate shown before a pile with a step in progress from a previous day can be
// carried into today's plan. Single continuously-visible form, not a wizard:
// the question — how much of the step was completed on the previous day?
// (the supervisor is the source of truth; the app never assumes an unlogged
// step is still open) — stays on screen after answering, and the matching
// section appears inline below it:
//   - Partially completed — capture the real time work stopped on the
//     previous day (closes out that day's row), then set an absolute "plan
//     finish time" for today's continuation — not an elapsed-time guess —
//     which is converted into a remaining-duration override for this pile
//     only.
//   - Fully completed — capture the real finish time (closes out the
//     previous day's row) and nothing else; this step isn't planned today.
// Mirrors the same time-of-day picker design used for logging actual
// start/finish times (see StepTimeControl.tsx) rather than a raw
// "how many minutes" duration picker.

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Keyboard } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CheckCircle2, Clock, Calendar, Hourglass, ClipboardCheck } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import Button from '@components/shared/Button';
import TimerSelectMenu from '@components/shared/NativeTimerSelectMenu';
import { formatTime, formatTimeWithDay, formatDuration, toLocalIsoString } from '@utils/formatTime';
import { notify } from '@utils/notify';
import { colors, spacing, radius, typography, shadow } from '@theme/theme';
import type { ResumeWork } from '@/types/plan';

interface ResumeTimeConfirmModalProps {
  visible: boolean;
  pileCode: string;
  resumeWork: ResumeWork;
  /** Where this step effectively starts in the new plan (after skipping any opening
   * non-working window) — the anchor the picked finish time's duration is measured
   * against. See pilingPlannerService.ts's resolveEffectiveDayStart. */
  effectiveStart: Date;
  /** Step was genuinely still in progress: pastEndIso closes out the previous
   * day's row, remainingMinutes/remarks continue it today. Awaited — closes out
   * the previous day's row and enqueues it for sync, so this must resolve (or
   * throw) before the modal advances. */
  onConfirmPartial: (pastEndIso: string, remainingMinutes: number, remarks: string) => Promise<void>;
  /** Step actually finished on the previous day, just never logged: pastEndIso
   * closes out that day's row; nothing is planned for it today. Awaited, same
   * as above. */
  onConfirmFull: (pastEndIso: string, remarks: string) => Promise<void>;
  /** When true, the modal edits `resumeWork.lastConfirmedFull` — the step most
   * recently marked "Fully completed" for this pile — instead of the pile's
   * live in-progress step (which, once confirmFull has run, represents the
   * *next* step, not the one being edited here). Skips the "Partially/Fully
   * completed" choice entirely (no switching back to partial) and jumps
   * straight to the finish-time + remarks fields, prefilled from
   * lastConfirmedFull. Requires onConfirmEditedFull. */
  editingCompleted?: boolean;
  /** Saves an edit made in editingCompleted mode. Not awaited by anything but
   * this modal's own handleConfirmFull, same pattern as onConfirmFull. */
  onConfirmEditedFull?: (pastEndIso: string, remarks: string) => Promise<void>;
  onClose: () => void;
}

type ResumeStatus = 'partial' | 'full' | null;

const REMARKS_MAX_LENGTH = 300;
// Keeps the "Completed" card's height bounded and roughly in balance with the
// "In progress" card next to it, regardless of how many prior steps a pile has
// — the rest collapse into a "+N more completed" line instead of pushing the
// whole modal taller.
const COMPLETED_STEPS_PREVIEW_LIMIT = 3;

/** The step's canonical template duration (the same avg. minutes that seeds "Plan finish
 * time" below), added onto the day work actually started — a much better first guess for
 * "when did this actually stop/finish on the previous day" than the wall-clock moment the supervisor
 * happens to open this modal. Falls back to the historical checklist's date when there's no
 * logged start yet (this modal only opens for steps with a real actualStart in practice, via
 * pileNeedsResumeConfirm's wasStarted gate — see useResumeConfirmQueue.ts). */
function seedPastTime(
  pastActualStart: string | null | undefined,
  checklistDate: string | undefined,
  templateMinutes: number,
): Date {
  const anchorSource = pastActualStart ?? (checklistDate ? `${checklistDate}T00:00:00` : null);
  if (!anchorSource) return new Date();
  const anchor = new Date(anchorSource);
  if (Number.isNaN(anchor.getTime())) return new Date();
  return new Date(anchor.getTime() + Math.max(0, templateMinutes) * 60000);
}

export default function ResumeTimeConfirmModal({
  visible,
  pileCode,
  resumeWork,
  effectiveStart,
  onConfirmPartial,
  onConfirmFull,
  editingCompleted = false,
  onConfirmEditedFull,
  onClose,
}: ResumeTimeConfirmModalProps) {
  const seedFinish = () =>
    new Date(effectiveStart.getTime() + Math.max(0, resumeWork.remainingMinutes) * 60000);

  // In editingCompleted mode, "the previous day" refers to lastConfirmedFull's own
  // step — resumeWork.pastActualStart/stepName by then describe the *next*
  // step confirmFull advanced to, not the one being edited here.
  const activePastActualStart = editingCompleted
    ? resumeWork.lastConfirmedFull?.pastActualStart ?? null
    : resumeWork.pastActualStart;
  const activeStepName = editingCompleted ? resumeWork.lastConfirmedFull?.stepName : resumeWork.stepName;

  const [status, setStatus] = useState<ResumeStatus>(
    editingCompleted ? 'full' : (resumeWork.confirmedStatus ?? null),
  );
  const [pastDate, setPastDate] = useState<Date>(() => {
    if (editingCompleted) {
      return resumeWork.lastConfirmedFull ? new Date(resumeWork.lastConfirmedFull.pastEndIso) : new Date();
    }
    if (resumeWork.confirmedPastEndIso) return new Date(resumeWork.confirmedPastEndIso);
    return seedPastTime(resumeWork.pastActualStart, resumeWork.checklistDate, resumeWork.remainingMinutes);
  });
  const [finishDate, setFinishDate] = useState<Date>(seedFinish);
  const [pickerTarget, setPickerTarget] = useState<'past' | 'finish' | null>(null);
  const [remarks, setRemarks] = useState(
    editingCompleted ? (resumeWork.lastConfirmedFull?.remarks ?? '') : (resumeWork.confirmedRemarks ?? ''),
  );
  const [saving, setSaving] = useState(false);

  async function handleConfirmPartial() {
    setSaving(true);
    try {
      await onConfirmPartial(toLocalIsoString(pastDate), remainingMinutes, remarks.trim());
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Could not save the previous day’s finish time. Please try again.', {
        title: 'Failed to save',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmFull() {
    setSaving(true);
    try {
      if (editingCompleted) {
        await onConfirmEditedFull?.(toLocalIsoString(pastDate), remarks.trim());
      } else {
        await onConfirmFull(toLocalIsoString(pastDate), remarks.trim());
      }
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Could not save the previous day’s finish time. Please try again.', {
        title: 'Failed to save',
      });
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!visible) return;
    if (editingCompleted) {
      setStatus('full');
      setPastDate(
        resumeWork.lastConfirmedFull ? new Date(resumeWork.lastConfirmedFull.pastEndIso) : new Date(),
      );
      setRemarks(resumeWork.lastConfirmedFull?.remarks ?? '');
      return;
    }
    setStatus(resumeWork.confirmedStatus ?? null);
    setPastDate(
      resumeWork.confirmedPastEndIso
        ? new Date(resumeWork.confirmedPastEndIso)
        : seedPastTime(resumeWork.pastActualStart, resumeWork.checklistDate, resumeWork.remainingMinutes),
    );
    setFinishDate(seedFinish());
    setRemarks(resumeWork.confirmedRemarks ?? '');
  }, [
    visible,
    editingCompleted,
    resumeWork.remainingMinutes,
    resumeWork.pastActualStart,
    resumeWork.checklistDate,
    resumeWork.lastConfirmedFull,
    resumeWork.confirmedStatus,
    resumeWork.confirmedPastEndIso,
    resumeWork.confirmedRemarks,
    effectiveStart,
  ]);

  const completedSteps = resumeWork.completedSteps ?? [];
  const visibleCompletedSteps = completedSteps.slice(0, COMPLETED_STEPS_PREVIEW_LIMIT);
  const extraCompletedCount = Math.max(0, completedSteps.length - COMPLETED_STEPS_PREVIEW_LIMIT);
  const pastActualStartDate = activePastActualStart ? new Date(activePastActualStart) : null;
  const pastTimeValid = !pastActualStartDate || pastDate.getTime() >= pastActualStartDate.getTime();

  function handleFinishPicked(date: Date) {
    let picked = new Date(effectiveStart);
    picked.setHours(date.getHours(), date.getMinutes(), 0, 0);
    if (picked.getTime() < effectiveStart.getTime()) {
      picked = new Date(picked.getTime() + 24 * 60 * 60 * 1000);
    }
    setFinishDate(picked);
  }

  const remainingMinutes = Math.max(
    0,
    Math.round((finishDate.getTime() - effectiveStart.getTime()) / 60000),
  );

  const title = pileCode;
  const stepLabel = (editingCompleted ? activeStepName : resumeWork.stepName) ?? 'Step';

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={title}
      position="bottom"
      showCloseButton={false}
      headerRight={
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>
            {editingCompleted ? 'Edit completed time' : statusSubtitle(status)}
          </Text>
        </View>
      }
    >
      <View style={styles.content}>
        {!editingCompleted && (
        <View style={styles.stepsSection}>
          <Text style={styles.stepsSectionLabel}>Previous day&apos;s steps</Text>
          <View style={styles.stepsListCard}>
            {visibleCompletedSteps.map((c) => (
              <View key={c.stepId} style={styles.timelineRow}>
                <View style={[styles.timelineIconWrap, { backgroundColor: colors.successSoft }]}>
                  <CheckCircle2 size={16} color={colors.success} />
                </View>
                <View style={styles.timelineInfo}>
                  <Text style={styles.timelineStepName} numberOfLines={1}>{c.stepName}</Text>
                  <Text style={[styles.timelineStatusText, { color: colors.success }]}>Completed</Text>
                  {c.actualStart && c.actualEnd ? (
                    <Text style={styles.timelineTimes}>
                      {formatTime(c.actualStart)} → {formatTime(c.actualEnd)}
                    </Text>
                  ) : (
                    <Text style={styles.timelineTimes}>No finish time logged</Text>
                  )}
                </View>
              </View>
            ))}
            {extraCompletedCount > 0 && (
              <View style={styles.timelineRow}>
                <Text style={styles.moreCompletedText}>+{extraCompletedCount} more completed</Text>
              </View>
            )}

            <View style={[styles.timelineRow, styles.timelineRowLast]}>
              <View style={[styles.timelineIconWrap, { backgroundColor: colors.warningSoft }]}>
                <Clock size={16} color={colors.warning} />
              </View>
              <View style={styles.timelineInfo}>
                <Text style={styles.timelineStepName} numberOfLines={1}>{stepLabel}</Text>
                <Text style={[styles.timelineStatusText, { color: colors.warning }]}>In progress</Text>
                {resumeWork.pastActualStart && (
                  <Text style={styles.timelineTimes}>
                    Started {formatTimeWithDay(resumeWork.pastActualStart)} · No finish time logged yet
                  </Text>
                )}
              </View>
            </View>
          </View>
        </View>
        )}

        {!editingCompleted && (
        <>
        <Text style={styles.question}>How much of &ldquo;{stepLabel}&rdquo; was completed on the previous day?</Text>

        <Pressable
          style={({ pressed }) => [
            styles.choiceBtn,
            status === 'partial' && styles.choiceBtnSelectedWarning,
            pressed && styles.choiceBtnPressed,
          ]}
          onPress={() => setStatus('partial')}
        >
          <View style={[styles.choiceIconWrap, { backgroundColor: colors.warningSoft }]}>
            <Clock size={20} color={colors.warning} />
          </View>
          <View style={styles.choiceTextWrap}>
            <Text style={styles.choiceBtnText}>Partially completed</Text>
            <Text style={styles.choiceBtnHint}>Still needs more time today</Text>
          </View>
          {status === 'partial' ? (
            <View style={[styles.radioOuter, { borderColor: colors.warning }]}>
              <View style={[styles.radioDot, { backgroundColor: colors.warning }]} />
            </View>
          ) : (
            <View style={styles.radioOuter} />
          )}
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.choiceBtn,
            status === 'full' && styles.choiceBtnSelectedSuccess,
            pressed && styles.choiceBtnPressed,
          ]}
          onPress={() => setStatus('full')}
        >
          <View style={[styles.choiceIconWrap, { backgroundColor: colors.successSoft }]}>
            <CheckCircle2 size={20} color={colors.success} />
          </View>
          <View style={styles.choiceTextWrap}>
            <Text style={styles.choiceBtnText}>Fully completed</Text>
            <Text style={styles.choiceBtnHint}>Just never got logged</Text>
          </View>
          {status === 'full' ? (
            <View style={[styles.radioOuter, { borderColor: colors.success }]}>
              <View style={[styles.radioDot, { backgroundColor: colors.success }]} />
            </View>
          ) : (
            <View style={styles.radioOuter} />
          )}
        </Pressable>
        </>
        )}

        {status && (
          <View style={styles.sectionCardBlue}>
            <View style={[styles.sectionHeaderBlue, styles.sectionHeaderBlueFirst]}>
              <Clock size={14} color={colors.accentBlue} />
              <Text style={styles.sectionHeaderBlueText}>Previous day&apos;s work details</Text>
            </View>
            <Text style={styles.sectionHeaderSubtitle}>
              When work actually started and {status === 'partial' ? 'stopped' : 'finished'} on the previous day
            </Text>

            <View style={styles.stepsListCard}>
              <View style={styles.timelineRow}>
                <View style={[styles.timelineIconWrap, { backgroundColor: 'rgba(28,28,46,0.06)' }]}>
                  <Feather name="clock" size={16} color={colors.textSecondary} />
                </View>
                <View style={styles.timelineInfo}>
                  <Text style={styles.compactPillLabel}>Started previous day</Text>
                  <Text style={styles.compactPillValue}>
                    {activePastActualStart ? formatTimeWithDay(activePastActualStart) : '—'}
                  </Text>
                </View>
              </View>

              <Pressable
                style={[styles.timelineRow, styles.timelineRowLast]}
                onPress={() => setPickerTarget('past')}
              >
                <View style={[styles.timelineIconWrap, { backgroundColor: colors.accentSoft }]}>
                  <Feather name="clock" size={16} color={colors.accent} />
                </View>
                <View style={styles.timelineInfo}>
                  <Text style={styles.compactPillLabel}>{status === 'partial' ? 'Stopped previous day' : 'Finished previous day'}</Text>
                  <Text style={[styles.compactPillValue, styles.compactPillValueActive]}>
                    {formatTimeWithDay(toLocalIsoString(pastDate))}
                  </Text>
                </View>
                <Feather name="edit-3" size={12} color={colors.accent} />
              </Pressable>
            </View>

            {!pastTimeValid && (
              <Text style={styles.errorHint}>Must be after this step&apos;s start time.</Text>
            )}

            {activePastActualStart && (
              <View style={styles.workedChip}>
                <Clock size={14} color={colors.textSecondary} />
                <Text style={styles.workedChipText}>
                  Worked for {formatDuration(activePastActualStart, toLocalIsoString(pastDate))}
                </Text>
              </View>
            )}
          </View>
        )}

        {status === 'partial' && (
          <>
            <View style={styles.sectionCardBlue}>
              <View style={[styles.sectionHeaderBlue, styles.sectionHeaderBlueFirst]}>
                <Calendar size={14} color={colors.accentBlue} />
                <Text style={styles.sectionHeaderBlueText}>Today&apos;s plan</Text>
              </View>

              <View style={[styles.stepsListCard, styles.stepsListCardSpaced]}>
                <View style={styles.timelineRow}>
                  <View style={[styles.timelineIconWrap, { backgroundColor: 'rgba(28,28,46,0.06)' }]}>
                    <Feather name="clock" size={16} color={colors.textSecondary} />
                  </View>
                  <View style={styles.timelineInfo}>
                    <Text style={styles.compactPillLabel}>Plan start</Text>
                    <Text style={styles.compactPillValue}>{formatTime(toLocalIsoString(effectiveStart))}</Text>
                  </View>
                </View>

                <Pressable
                  style={[styles.timelineRow, styles.timelineRowLast]}
                  onPress={() => setPickerTarget('finish')}
                >
                  <View style={[styles.timelineIconWrap, { backgroundColor: colors.accentSoft }]}>
                    <Feather name="clock" size={16} color={colors.accent} />
                  </View>
                  <View style={styles.timelineInfo}>
                    <Text style={styles.compactPillLabel}>Plan finish time</Text>
                    <Text style={[styles.compactPillValue, styles.compactPillValueActive]}>
                      {formatTime(toLocalIsoString(finishDate))}
                    </Text>
                  </View>
                  <Feather name="edit-3" size={12} color={colors.accent} />
                </Pressable>
              </View>

              <View style={styles.remainingChip}>
                <Hourglass size={14} color={colors.textSecondary} />
                <Text style={styles.remainingChipText}>
                  ≈ {Math.floor(remainingMinutes / 60)}h {remainingMinutes % 60}m remaining
                </Text>
              </View>
            </View>

            <Text style={styles.remarksLabel}>
              Remarks <Text style={styles.remarksLabelOptional}>(optional)</Text>
            </Text>
            <View style={styles.textareaWrap}>
              <TextInput
                style={styles.textarea}
                multiline
                numberOfLines={3}
                maxLength={REMARKS_MAX_LENGTH}
                placeholder="Reason for the delay, notes for tomorrow…"
                placeholderTextColor={colors.textSecondary}
                value={remarks}
                onChangeText={setRemarks}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{remarks.length}/{REMARKS_MAX_LENGTH}</Text>
            </View>

            <Button
              label="Confirm & Assign"
              icon={ClipboardCheck}
              disabled={remainingMinutes <= 0 || !pastTimeValid}
              loading={saving}
              onPress={() => {
                Keyboard.dismiss();
                handleConfirmPartial();
              }}
              style={styles.confirmBtn}
            />
          </>
        )}

        {status === 'full' && (
          <>
            <Text style={styles.remarksLabel}>
              Remarks <Text style={styles.remarksLabelOptional}>(optional)</Text>
            </Text>
            <View style={styles.textareaWrap}>
              <TextInput
                style={styles.textarea}
                multiline
                numberOfLines={3}
                maxLength={REMARKS_MAX_LENGTH}
                placeholder="Notes for the record…"
                placeholderTextColor={colors.textSecondary}
                value={remarks}
                onChangeText={setRemarks}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{remarks.length}/{REMARKS_MAX_LENGTH}</Text>
            </View>

            <Button
              label={editingCompleted ? 'Save Changes' : 'Confirm Completed'}
              icon={CheckCircle2}
              disabled={!pastTimeValid}
              loading={saving}
              onPress={() => {
                Keyboard.dismiss();
                handleConfirmFull();
              }}
              style={styles.confirmBtn}
            />
          </>
        )}
      </View>

      <TimerSelectMenu
        visible={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        initialDate={pickerTarget === 'finish' ? finishDate : pastDate}
        onConfirm={(date) => {
          if (pickerTarget === 'finish') {
            handleFinishPicked(date);
          } else {
            setPastDate(date);
          }
          setPickerTarget(null);
        }}
      />
    </AppModal>
  );
}

function statusSubtitle(status: ResumeStatus): string {
  switch (status) {
    case 'partial':
      return 'Continuing today';
    case 'full':
      return 'Set plan finish time';
    default:
      return 'Confirm previous day’s progress';
  }
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.md },

  // Now rendered into AppModal's header (headerRight), next to the pile code
  // title, instead of as the first row of scrollable content.
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm + 2,
  },
  statusBadgeText: { ...typography.caption, fontWeight: '700', color: colors.accent },

  stepsSection: { marginBottom: spacing.md },
  stepsSectionLabel: {
    ...typography.caption,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  stepsListCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm + 2,
  },
  stepsListCardSpaced: { marginTop: spacing.sm },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(28,28,46,0.06)',
  },
  timelineRowLast: { borderBottomWidth: 0 },
  timelineIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineInfo: { flex: 1 },
  timelineStepName: { ...typography.caption, fontWeight: '700', color: colors.textPrimary },
  timelineStatusText: { ...typography.caption, fontWeight: '700', marginTop: 1 },
  timelineTimes: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  moreCompletedText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700', flex: 1 },

  question: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  choiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
    ...shadow.soft,
  },
  choiceBtnPressed: {
    backgroundColor: colors.white,
    transform: [{ scale: 0.98 }],
  },
  choiceBtnSelectedWarning: {
    borderColor: colors.warning,
    borderWidth: 2,
    backgroundColor: colors.white,
  },
  choiceBtnSelectedSuccess: {
    borderColor: colors.success,
    borderWidth: 2,
    backgroundColor: colors.white,
  },
  choiceIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceTextWrap: { flex: 1 },
  choiceBtnText: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  choiceBtnHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 12, height: 12, borderRadius: 6 },

  sectionCardBlue: {
    backgroundColor: 'rgba(102,181,218,0.10)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  sectionHeaderBlue: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sectionHeaderBlueFirst: { marginTop: 0 },
  sectionHeaderBlueText: {
    ...typography.caption,
    fontWeight: '800',
    color: colors.accentBlue,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHeaderSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.sm,
  },

  // Label/value text styles reused inside the timelineRow-styled rows above
  // (Previous day's work details / Today's plan) — same as the compact-pill
  // wording before this section switched from side-by-side boxes to rows.
  compactPillLabel: { ...typography.caption, color: colors.textSecondary },
  compactPillValue: { ...typography.body, fontWeight: '700', color: colors.textSecondary },
  compactPillValueActive: { color: colors.textPrimary },

  workedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  workedChipText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },

  remainingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(20,20,31,0.05)',
    borderRadius: radius.md,
    paddingVertical: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  remainingChipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },

  remarksLabel: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  remarksLabelOptional: { ...typography.caption, fontWeight: '400', color: colors.textSecondary },

  textareaWrap: { position: 'relative' },
  textarea: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: 'rgba(28,28,46,0.06)',
    borderRadius: radius.md,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    minHeight: 80,
  },
  charCount: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.xs,
    ...typography.caption,
    color: colors.textSecondary,
  },

  errorHint: {
    ...typography.caption,
    color: colors.danger,
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  confirmBtn: { marginTop: spacing.lg },
});
