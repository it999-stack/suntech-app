// src/components/plan/generate/steps/resume-confirm/ResumeTimeConfirmModal.tsx
//
// Gate shown before a pile with a step in progress from a previous day can be
// carried into today's plan. Single continuously-visible form, not a wizard:
// the question — how much of the step was completed yesterday? (the
// supervisor is the source of truth; the app never assumes an unlogged step
// is still open) — stays on screen after answering, and the matching section
// appears inline below it:
//   - Partially completed — capture the real time work stopped yesterday
//     (closes out yesterday's row), then set an absolute "plan finish time"
//     for today's continuation — not an elapsed-time guess — which is
//     converted into a remaining-duration override for this pile only.
//   - Fully completed — capture the real finish time (closes out
//     yesterday's row) and nothing else; this step isn't planned today.
// Mirrors the same time-of-day picker design used for logging actual
// start/finish times (see StepTimeControl.tsx) rather than a raw
// "how many minutes" duration picker.

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Keyboard } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CheckCircle2, Clock, ArrowRight, Calendar, Hourglass, ClipboardCheck } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import TimerSelectMenu from '@components/shared/NativeTimerSelectMenu';
import { formatTime, formatTimeWithDay, formatDuration, toLocalIsoString } from '@utils/formatTime';
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
  /** Step was genuinely still in progress: pastEndIso closes out yesterday's row,
   * remainingMinutes/remarks continue it today. */
  onConfirmPartial: (pastEndIso: string, remainingMinutes: number, remarks: string) => void;
  /** Step actually finished yesterday, just never logged: pastEndIso closes out
   * yesterday's row; nothing is planned for it today. */
  onConfirmFull: (pastEndIso: string, remarks: string) => void;
  onClose: () => void;
}

type ResumeStatus = 'partial' | 'full' | null;

const REMARKS_MAX_LENGTH = 300;
// Keeps the "Completed" card's height bounded and roughly in balance with the
// "In progress" card next to it, regardless of how many prior steps a pile has
// — the rest collapse into a "+N more completed" line instead of pushing the
// whole modal taller.
const COMPLETED_STEPS_PREVIEW_LIMIT = 3;

/** Today's time-of-day, applied onto the day work actually started (the
 * source of truth the "stop time" is validated against) — a reasonable
 * starting point for "when did this actually stop/finish yesterday". Falls
 * back to the historical checklist's date when there's no logged start yet. */
function seedPastTime(pastActualStart: string | null | undefined, checklistDate: string | undefined): Date {
  const now = new Date();
  const anchorSource = pastActualStart ?? (checklistDate ? `${checklistDate}T00:00:00` : null);
  if (!anchorSource) return now;
  const anchor = new Date(anchorSource);
  if (Number.isNaN(anchor.getTime())) return now;
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), now.getHours(), now.getMinutes(), 0, 0);
}

export default function ResumeTimeConfirmModal({
  visible,
  pileCode,
  resumeWork,
  effectiveStart,
  onConfirmPartial,
  onConfirmFull,
  onClose,
}: ResumeTimeConfirmModalProps) {
  const seedFinish = () =>
    new Date(effectiveStart.getTime() + Math.max(0, resumeWork.remainingMinutes) * 60000);

  const [status, setStatus] = useState<ResumeStatus>(null);
  const [pastDate, setPastDate] = useState<Date>(() => seedPastTime(resumeWork.pastActualStart, resumeWork.checklistDate));
  const [finishDate, setFinishDate] = useState<Date>(seedFinish);
  // Which field the shared NativeTimerSelectMenu is currently editing.
  const [pickerTarget, setPickerTarget] = useState<'past' | 'finish' | null>(null);
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (!visible) return;
    setStatus(null);
    setPastDate(seedPastTime(resumeWork.pastActualStart, resumeWork.checklistDate));
    setFinishDate(seedFinish());
    setRemarks('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, resumeWork.remainingMinutes, resumeWork.pastActualStart, resumeWork.checklistDate, effectiveStart]);

  const completedSteps = resumeWork.completedSteps ?? [];
  const visibleCompletedSteps = completedSteps.slice(0, COMPLETED_STEPS_PREVIEW_LIMIT);
  const extraCompletedCount = Math.max(0, completedSteps.length - COMPLETED_STEPS_PREVIEW_LIMIT);
  const pastActualStartDate = resumeWork.pastActualStart ? new Date(resumeWork.pastActualStart) : null;
  const pastTimeValid = !pastActualStartDate || pastDate.getTime() >= pastActualStartDate.getTime();

  // The finish-time picker only offers hour/minute on effectiveStart's own calendar
  // day — a pick earlier than effectiveStart's time-of-day means the step is
  // expected to finish after midnight, so roll it to the next day rather than
  // silently producing a negative/zero duration.
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
  const stepLabel = resumeWork.stepName ?? 'Step';

  return (
    <AppModal visible={visible} onClose={onClose} title={title} position="bottom">
      <View style={styles.content}>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>{statusSubtitle(status)}</Text>
        </View>

        <View style={styles.infoCardRow}>
          <View style={[styles.infoCardHalf, styles.infoCardCompleted]}>
            <View style={styles.infoCardHeaderRow}>
              <View style={[styles.infoCardIconCircle, { backgroundColor: colors.success }]}>
                <CheckCircle2 size={13} color={colors.white} />
              </View>
              <Text style={[styles.infoCardTitle, { color: colors.success }]}>Completed</Text>
            </View>
            <Text style={styles.infoCardSubtitle}>
              {completedSteps.length} task{completedSteps.length === 1 ? '' : 's'} finished
            </Text>
            {completedSteps.length > 0 && (
              <>
                <View style={styles.infoCardDivider} />
                {visibleCompletedSteps.map((c) => (
                  <View key={c.stepId} style={styles.infoCardStepRow}>
                    <Text style={styles.infoCardStepName} numberOfLines={1}>{c.stepName}</Text>
                    {c.actualStart && c.actualEnd ? (
                      <Text style={styles.infoCardStepTime}>
                        {formatTime(c.actualStart)} → {formatTime(c.actualEnd)}
                      </Text>
                    ) : (
                      <Text style={styles.infoCardStepTime}>No finish time logged</Text>
                    )}
                  </View>
                ))}
                {extraCompletedCount > 0 && (
                  <Text style={styles.infoCardMoreText}>+{extraCompletedCount} more completed</Text>
                )}
              </>
            )}
          </View>

          <View style={[styles.infoCardHalf, styles.infoCardInProgress]}>
            <View style={styles.infoCardHeaderRow}>
              <View style={[styles.infoCardIconCircle, { backgroundColor: colors.warning }]}>
                <Clock size={13} color={colors.white} />
              </View>
              <Text style={[styles.infoCardTitle, { color: colors.warning }]}>In progress</Text>
            </View>
            <Text style={styles.infoCardSubtitle}>1 task in progress</Text>
            <View style={styles.infoCardDivider} />
            <Text style={styles.infoCardStepName} numberOfLines={1}>{stepLabel}</Text>
            {resumeWork.pastActualStart && (
              <>
                <Text style={styles.infoCardMetaLine}>Started {formatTimeWithDay(resumeWork.pastActualStart)}</Text>
                <Text style={styles.infoCardMetaLine}>No finish time logged yet</Text>
              </>
            )}
          </View>
        </View>

        <Text style={styles.question}>How much of &ldquo;{stepLabel}&rdquo; was completed yesterday?</Text>

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

        {status && (
          <View style={styles.sectionCardBlue}>
            <View style={[styles.sectionHeaderBlue, styles.sectionHeaderBlueFirst]}>
              <Clock size={14} color={colors.accentBlue} />
              <Text style={styles.sectionHeaderBlueText}>Yesterday&apos;s work details</Text>
            </View>
            <Text style={styles.sectionHeaderSubtitle}>
              When work actually started and {status === 'partial' ? 'stopped' : 'finished'} yesterday
            </Text>

            <View style={styles.pillPairRow}>
              <View style={styles.compactPill}>
                <Text style={styles.compactPillLabel}>Started yesterday</Text>
                <View style={styles.compactPillValueRow}>
                  <Feather name="clock" size={16} color={colors.textSecondary} />
                  <Text style={styles.compactPillValue}>
                    {resumeWork.pastActualStart ? formatTimeWithDay(resumeWork.pastActualStart) : '—'}
                  </Text>
                </View>
              </View>

              <ArrowRight size={16} color={colors.textSecondary} style={styles.pillPairArrow} />

              <Pressable style={styles.compactPill} onPress={() => setPickerTarget('past')}>
                <View style={styles.compactPillTopRow}>
                  <Text style={styles.compactPillLabel}>{status === 'partial' ? 'Stopped yesterday' : 'Finished yesterday'}</Text>
                  <Feather name="edit-3" size={12} color={colors.accent} />
                </View>
                <View style={styles.compactPillValueRow}>
                  <Feather name="clock" size={16} color={colors.accent} />
                  <Text style={[styles.compactPillValue, styles.compactPillValueActive]}>
                    {formatTimeWithDay(toLocalIsoString(pastDate))}
                  </Text>
                </View>
              </Pressable>
            </View>

            {!pastTimeValid && (
              <Text style={styles.errorHint}>Must be after this step&apos;s start time.</Text>
            )}

            {resumeWork.pastActualStart && (
              <View style={styles.workedChip}>
                <Clock size={14} color={colors.textSecondary} />
                <Text style={styles.workedChipText}>
                  Worked for {formatDuration(resumeWork.pastActualStart, toLocalIsoString(pastDate))}
                </Text>
              </View>
            )}
          </View>
        )}

        {status === 'partial' && (
          <>
            <View style={[styles.sectionHeaderBlue, styles.sectionHeaderBlueSpaced]}>
              <Calendar size={14} color={colors.accentBlue} />
              <Text style={styles.sectionHeaderBlueText}>Today&apos;s plan</Text>
            </View>

            <View style={styles.pillPairRow}>
              <View style={styles.compactPill}>
                <Text style={styles.compactPillLabel}>Plan start</Text>
                <View style={styles.compactPillValueRow}>
                  <Feather name="clock" size={16} color={colors.textSecondary} />
                  <Text style={styles.compactPillValue}>{formatTime(toLocalIsoString(effectiveStart))}</Text>
                </View>
              </View>

              <Pressable style={styles.compactPill} onPress={() => setPickerTarget('finish')}>
                <View style={styles.compactPillTopRow}>
                  <Text style={styles.compactPillLabel}>Plan finish time</Text>
                  <Feather name="edit-3" size={12} color={colors.accent} />
                </View>
                <View style={styles.compactPillValueRow}>
                  <Feather name="clock" size={16} color={colors.accent} />
                  <Text style={[styles.compactPillValue, styles.compactPillValueActive]}>
                    {formatTime(toLocalIsoString(finishDate))}
                  </Text>
                </View>
              </Pressable>
            </View>

            <View style={styles.remainingChip}>
              <Hourglass size={14} color={colors.textSecondary} />
              <Text style={styles.remainingChipText}>
                ≈ {Math.floor(remainingMinutes / 60)}h {remainingMinutes % 60}m remaining
              </Text>
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

            <Pressable
              style={[styles.confirmBtn, (remainingMinutes <= 0 || !pastTimeValid) && styles.confirmBtnDisabled]}
              disabled={remainingMinutes <= 0 || !pastTimeValid}
              onPress={() => {
                Keyboard.dismiss();
                onConfirmPartial(toLocalIsoString(pastDate), remainingMinutes, remarks.trim());
              }}
            >
              <ClipboardCheck size={18} color={colors.white} />
              <Text style={styles.confirmBtnText}>Confirm & Assign</Text>
            </Pressable>
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

            <Pressable
              style={[styles.confirmBtn, !pastTimeValid && styles.confirmBtnDisabled]}
              disabled={!pastTimeValid}
              onPress={() => {
                Keyboard.dismiss();
                onConfirmFull(toLocalIsoString(pastDate), remarks.trim());
              }}
            >
              <CheckCircle2 size={18} color={colors.white} />
              <Text style={styles.confirmBtnText}>Confirm Completed</Text>
            </Pressable>
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
      return 'Confirm yesterday’s progress';
  }
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.md },

  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  statusBadgeText: { ...typography.caption, fontWeight: '700', color: colors.accent },

  infoCardRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  infoCardHalf: { flex: 1, borderRadius: radius.md, padding: spacing.sm + 2 },
  infoCardCompleted: { backgroundColor: colors.successSoft },
  infoCardInProgress: { backgroundColor: colors.warningSoft },
  infoCardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 },
  infoCardIconCircle: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  infoCardTitle: { ...typography.caption, fontWeight: '800' },
  infoCardSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  infoCardDivider: { height: 1, backgroundColor: 'rgba(20,20,31,0.08)', marginVertical: spacing.xs },
  infoCardStepRow: { marginBottom: spacing.xs },
  infoCardStepName: { ...typography.caption, fontWeight: '700', color: colors.textPrimary },
  infoCardStepTime: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  infoCardMoreText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700', marginTop: 2 },
  infoCardMetaLine: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },

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
  sectionHeaderBlueSpaced: { marginTop: spacing.lg },
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

  pillPairRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  pillPairArrow: { marginBottom: spacing.sm + 4 },
  compactPill: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  compactPillTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  compactPillLabel: { ...typography.caption, color: colors.textSecondary },
  compactPillValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
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

  confirmBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
});
