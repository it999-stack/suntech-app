// src/components/plan/generate/steps/resume-confirm/ResumeTimeConfirmModal.tsx
//
// Gate shown before a pile with a step in progress from a previous day can be
// carried into today's plan. Two-stage flow:
//   1. Status — was the step actually fully finished yesterday, or only
//      partially done? The supervisor is the source of truth; the app never
//      assumes an unlogged step is still open.
//   2a. Partially completed — capture the real time work stopped yesterday
//       (closes out yesterday's row), then set an absolute "plan finish
//       time" for today's continuation — not an elapsed-time guess — which
//       is converted into a remaining-duration override for this pile only.
//   2b. Fully completed — capture the real finish time (closes out
//       yesterday's row) and nothing else; this step isn't planned today.
// Mirrors the same time-of-day picker design used for logging actual
// start/finish times (see StepTimeControl.tsx) rather than a raw
// "how many minutes" duration picker.

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Keyboard } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CheckCircle2, Clock, ChevronRight } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import TimerSelectMenu from '@components/shared/TimerSelectMenu';
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

type Stage = 'status' | 'partial-past' | 'partial-finish' | 'full-past';

/** Today's time-of-day, applied onto the historical checklist's date — a
 * reasonable starting point for "when did this actually stop/finish
 * yesterday" (often close to when the supervisor is filling this in). */
function seedPastTime(checklistDate: string | undefined): Date {
  const now = new Date();
  if (!checklistDate) return now;
  const [y, m, d] = checklistDate.split('-').map(Number);
  if (!y || !m || !d) return now;
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), 0, 0);
}

/** TimerSelectMenu's returned date isn't reliably anchored to the day we care
 * about — only its hour/minute are trustworthy, applied onto our own anchor day. */
function applyPickedTime(picked: Date, anchorDate: Date): Date {
  const out = new Date(anchorDate);
  out.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return out;
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

  const [stage, setStage] = useState<Stage>('status');
  const [pastDate, setPastDate] = useState<Date>(() => seedPastTime(resumeWork.checklistDate));
  const [finishDate, setFinishDate] = useState<Date>(seedFinish);
  // Which field the shared TimerSelectMenu is currently editing — not always
  // implied by `stage` alone, since partial-finish lets you reopen the past
  // (yesterday) picker via the Yesterday recap's edit button without leaving
  // that stage.
  const [pickerTarget, setPickerTarget] = useState<'past' | 'finish' | null>(null);
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (!visible) return;
    setStage('status');
    setPastDate(seedPastTime(resumeWork.checklistDate));
    setFinishDate(seedFinish());
    setRemarks('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, resumeWork.remainingMinutes, resumeWork.checklistDate, effectiveStart]);

  const completedSteps = resumeWork.completedSteps ?? [];
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
    <AppModal visible={visible} onClose={onClose} title={title} subtitle={stageSubtitle(stage)} position="center">
      {stage === 'status' && (
        <View style={styles.content}>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <CheckCircle2 size={16} color={colors.success} style={styles.infoRowIcon} />
              <View style={styles.infoRowText}>
                <Text style={styles.infoLabel}>Completed</Text>
                {completedSteps.length > 0 ? (
                  completedSteps.map((c) => (
                    <Text key={c.stepId} style={styles.infoValue}>
                      {c.stepName}
                      {c.actualStart && c.actualEnd ? ` · ${formatTime(c.actualStart)} → ${formatTime(c.actualEnd)}` : ''}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.infoValue}>No steps completed yet</Text>
                )}
              </View>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <Clock size={16} color={colors.warning} style={styles.infoRowIcon} />
              <View style={styles.infoRowText}>
                <Text style={styles.infoLabel}>In progress</Text>
                <Text style={styles.infoValue}>{stepLabel}</Text>
                {resumeWork.pastActualStart && (
                  <Text style={styles.infoMeta}>
                    Started {formatTimeWithDay(resumeWork.pastActualStart)} · no finish time logged
                  </Text>
                )}
              </View>
            </View>
          </View>

          <Text style={styles.question}>Was &ldquo;{stepLabel}&rdquo; fully finished yesterday, or only partially done?</Text>

          <Pressable
            style={({ pressed }) => [styles.choiceBtn, pressed && styles.choiceBtnPressed]}
            onPress={() => setStage('partial-past')}
          >
            <View style={[styles.choiceIconWrap, { backgroundColor: colors.warningSoft }]}>
              <Clock size={20} color={colors.warning} />
            </View>
            <View style={styles.choiceTextWrap}>
              <Text style={styles.choiceBtnText}>Partially completed</Text>
              <Text style={styles.choiceBtnHint}>Still needs more time today</Text>
            </View>
            <ChevronRight size={20} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.choiceBtn, pressed && styles.choiceBtnPressed]}
            onPress={() => setStage('full-past')}
          >
            <View style={[styles.choiceIconWrap, { backgroundColor: colors.successSoft }]}>
              <CheckCircle2 size={20} color={colors.success} />
            </View>
            <View style={styles.choiceTextWrap}>
              <Text style={styles.choiceBtnText}>Fully completed</Text>
              <Text style={styles.choiceBtnHint}>Just never got logged</Text>
            </View>
            <ChevronRight size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      )}

      {stage === 'partial-past' && (
        <View style={styles.content}>
          {resumeWork.pastActualStart && (
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Clock size={16} color={colors.warning} style={styles.infoRowIcon} />
                <View style={styles.infoRowText}>
                  <Text style={styles.infoLabel}>{stepLabel}</Text>
                  <Text style={styles.infoValue}>Started {formatTimeWithDay(resumeWork.pastActualStart)}</Text>
                </View>
              </View>
            </View>
          )}

          <Text style={styles.fieldLabel}>When did work actually stop yesterday?</Text>
          <Pressable style={styles.timePill} onPress={() => setPickerTarget('past')}>
            <Feather name="clock" size={19} color={colors.accent} style={styles.timePillIcon} />
            <Text style={styles.timePillText}>{formatTimeWithDay(toLocalIsoString(pastDate))}</Text>
            <View style={styles.timePillEditBadge}>
              <Feather name="edit-3" size={14} color={colors.accent} />
            </View>
          </Pressable>
          {!pastTimeValid && (
            <Text style={styles.errorHint}>Must be after this step&apos;s start time.</Text>
          )}

          <Pressable
            style={[styles.confirmBtn, !pastTimeValid && styles.confirmBtnDisabled]}
            disabled={!pastTimeValid}
            onPress={() => setStage('partial-finish')}
          >
            <Text style={styles.confirmBtnText}>Next</Text>
          </Pressable>
        </View>
      )}

      {stage === 'partial-finish' && (
        <View style={styles.content}>
          {resumeWork.pastActualStart && (
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Clock size={16} color={colors.warning} style={styles.infoRowIcon} />
                <View style={styles.infoRowText}>
                  <Text style={styles.infoLabel}>Yesterday</Text>
                  <Text style={styles.infoValue}>{stepLabel}</Text>
                  <Text style={styles.infoMeta}>
                    {formatTime(resumeWork.pastActualStart)} → {formatTime(toLocalIsoString(pastDate))} · worked{' '}
                    {formatDuration(resumeWork.pastActualStart, toLocalIsoString(pastDate))}
                  </Text>
                </View>
                <Pressable
                  style={styles.infoEditBadge}
                  hitSlop={8}
                  onPress={() => setPickerTarget('past')}
                  accessibilityLabel="Edit yesterday's stop time"
                >
                  <Feather name="edit-3" size={14} color={colors.accent} />
                </Pressable>
              </View>
              {!pastTimeValid && (
                <Text style={styles.errorHint}>Must be after this step&apos;s start time.</Text>
              )}
            </View>
          )}

          <Text style={styles.sectionLabel}>Today</Text>
          <Text style={styles.fieldLabel}>Plan start</Text>
          <View style={styles.timePillStatic}>
            <Feather name="clock" size={19} color={colors.textSecondary} style={styles.timePillIcon} />
            <Text style={[styles.timePillText, styles.timePillTextMuted]}>{formatTime(toLocalIsoString(effectiveStart))}</Text>
          </View>

          <Text style={styles.fieldLabel}>Plan finish time</Text>
          <Pressable style={styles.timePill} onPress={() => setPickerTarget('finish')}>
            <Feather name="clock" size={19} color={colors.accent} style={styles.timePillIcon} />
            <Text style={styles.timePillText}>{formatTime(toLocalIsoString(finishDate))}</Text>
            <View style={styles.timePillEditBadge}>
              <Feather name="edit-3" size={14} color={colors.accent} />
            </View>
          </Pressable>
          <Text style={styles.durationHint}>
            ≈ {Math.floor(remainingMinutes / 60)}h {remainingMinutes % 60}m remaining
          </Text>

          <Text style={styles.fieldLabel}>Remarks</Text>
          <TextInput
            style={styles.textarea}
            multiline
            numberOfLines={3}
            placeholder="Reason for the delay, notes for tomorrow…"
            placeholderTextColor={colors.textSecondary}
            value={remarks}
            onChangeText={setRemarks}
            textAlignVertical="top"
          />

          <Pressable
            style={[styles.confirmBtn, (remainingMinutes <= 0 || !pastTimeValid) && styles.confirmBtnDisabled]}
            disabled={remainingMinutes <= 0 || !pastTimeValid}
            onPress={() => {
              Keyboard.dismiss();
              onConfirmPartial(toLocalIsoString(pastDate), remainingMinutes, remarks.trim());
            }}
          >
            <Text style={styles.confirmBtnText}>Confirm & Assign</Text>
          </Pressable>
        </View>
      )}

      {stage === 'full-past' && (
        <View style={styles.content}>
          {resumeWork.pastActualStart && (
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Clock size={16} color={colors.warning} style={styles.infoRowIcon} />
                <View style={styles.infoRowText}>
                  <Text style={styles.infoLabel}>{stepLabel}</Text>
                  <Text style={styles.infoValue}>Started {formatTimeWithDay(resumeWork.pastActualStart)}</Text>
                </View>
              </View>
            </View>
          )}

          <Text style={styles.fieldLabel}>When did &ldquo;{stepLabel}&rdquo; actually finish yesterday?</Text>
          <Pressable style={styles.timePill} onPress={() => setPickerTarget('past')}>
            <Feather name="clock" size={19} color={colors.accent} style={styles.timePillIcon} />
            <Text style={styles.timePillText}>{formatTimeWithDay(toLocalIsoString(pastDate))}</Text>
            <View style={styles.timePillEditBadge}>
              <Feather name="edit-3" size={14} color={colors.accent} />
            </View>
          </Pressable>
          {!pastTimeValid && (
            <Text style={styles.errorHint}>Must be after this step&apos;s start time.</Text>
          )}

          <Text style={styles.fieldLabel}>Remarks</Text>
          <TextInput
            style={styles.textarea}
            multiline
            numberOfLines={3}
            placeholder="Notes for the record…"
            placeholderTextColor={colors.textSecondary}
            value={remarks}
            onChangeText={setRemarks}
            textAlignVertical="top"
          />

          <Pressable
            style={[styles.confirmBtn, !pastTimeValid && styles.confirmBtnDisabled]}
            disabled={!pastTimeValid}
            onPress={() => {
              Keyboard.dismiss();
              onConfirmFull(toLocalIsoString(pastDate), remarks.trim());
            }}
          >
            <Text style={styles.confirmBtnText}>Confirm Completed</Text>
          </Pressable>
        </View>
      )}

      <TimerSelectMenu
        visible={pickerTarget !== null}
        onClose={() => setPickerTarget(null)}
        initialDate={pickerTarget === 'finish' ? finishDate : pastDate}
        onConfirm={(date) => {
          if (pickerTarget === 'finish') {
            handleFinishPicked(date);
          } else {
            setPastDate((prev) => applyPickedTime(date, prev));
          }
          setPickerTarget(null);
        }}
      />
    </AppModal>
  );
}

function stageSubtitle(stage: Stage): string {
  switch (stage) {
    case 'status':
      return 'Confirm yesterday’s progress';
    case 'partial-past':
    case 'partial-finish':
      return 'Continuing today';
    case 'full-past':
      return 'Set plan finish time';
  }
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.md },
  infoCard: {
    backgroundColor: 'rgba(28,28,46,0.04)',
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoRowIcon: { marginTop: 2, marginRight: spacing.sm },
  infoRowText: { flex: 1 },
  infoDivider: {
    height: 1,
    backgroundColor: 'rgba(28,28,46,0.08)',
    marginVertical: spacing.sm,
  },
  infoLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  infoValue: { ...typography.body, color: colors.textPrimary },
  infoMeta: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  infoEditBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
    alignSelf: 'center',
  },
  question: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.md,
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
    backgroundColor: 'rgba(28,28,46,0.04)',
    transform: [{ scale: 0.98 }],
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
  fieldLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionLabel: {
    ...typography.caption,
    fontWeight: '800',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
  },
  timePill: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.accentSoft,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    // Room on the right for the absolutely-positioned edit badge, so
    // left-aligned text of any length never runs underneath it.
    paddingRight: spacing.md + 28 + spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  // Read-only variant (e.g. "Plan start", a computed value, not user-editable)
  // — same shape as timePill minus the edit badge, so no reserved right padding.
  timePillStatic: {
    backgroundColor: 'rgba(28,28,46,0.04)',
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  timePillIcon: { marginRight: spacing.xs + 2 },
  timePillText: { ...typography.h2, fontWeight: '700', color: colors.textPrimary, textAlign: 'left' },
  timePillTextMuted: { color: colors.textSecondary },
  timePillEditBadge: {
    position: 'absolute',
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationHint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  errorHint: {
    ...typography.caption,
    color: colors.danger,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  textarea: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: 'rgba(28,28,46,0.06)',
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 80,
  },
  confirmBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { ...typography.body, fontWeight: '700', color: colors.white },
});
