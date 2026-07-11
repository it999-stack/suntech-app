// src/components/plan/actual/StepRow.tsx

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { CheckCircle2, Clock, ArrowRight } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import TimerSelectMenu from '@components/shared/TimerSelectMenu';
import { formatMinutes } from '@utils/formatTime';
import { colors, spacing, radius, typography } from '@theme/theme';
import { ActualEntry } from '@app-types/plan';

function nowAsMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

interface StepRowProps {
  entry: ActualEntry;
  /** Called when the user logs a start or finish time (minutes since midnight). */
  onSetActualTime?: (stepId: string, field: 'actualStart' | 'actualEnd', minutes: number) => void;
}

export default function StepRow({ entry, onSetActualTime }: StepRowProps) {
  const handleSet = onSetActualTime ?? (() => {});
  const [editing, setEditing] = useState<'start' | 'end' | null>(null);
  const [draftMinutes, setDraftMinutes] = useState(entry.plannedStart);
  const [pickerOpen, setPickerOpen] = useState(false);

  const hasStart = entry.actualStart !== undefined;
  const hasEnd = entry.actualEnd !== undefined;

  function openEditor(which: 'start' | 'end') {
    setDraftMinutes(which === 'start' ? entry.plannedStart : entry.plannedEnd);
    setEditing(which);
  }

  function confirmDraft() {
    if (!editing) return;
    handleSet(entry.stepId, editing === 'start' ? 'actualStart' : 'actualEnd', draftMinutes);
    setEditing(null);
  }

  function logNow(which: 'start' | 'end') {
    handleSet(entry.stepId, which === 'start' ? 'actualStart' : 'actualEnd', nowAsMinutes());
  }

  return (
    <>
    <GlassCard style={styles.stepCard}>
      <View style={styles.stepHeaderRow}>
        <Text style={styles.stepTitle}>
          {entry.pileCode} · {entry.stepName}
        </Text>
        <View
          style={[
            styles.trackBadge,
            { backgroundColor: entry.track === 'RIG' ? colors.accentSoft : 'rgba(255,149,0,0.12)' },
          ]}
        >
          <Text style={[styles.trackTag, { color: entry.track === 'RIG' ? colors.accent : colors.warning }]}>
            {entry.track}
          </Text>
        </View>
      </View>
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatMinutes(entry.plannedStart)}</Text>
        <ArrowRight size={12} color={colors.textSecondary} style={styles.timeIcon} />
        <Text style={styles.timeText}>{formatMinutes(entry.plannedEnd)}</Text>
      </View>

      {/* Actual start */}
      <View style={styles.actualRow}>
        <View style={styles.actualLabelWrap}>
          {hasStart ? <CheckCircle2 size={16} color={colors.success} /> : <Clock size={16} color={colors.textSecondary} />}
          <Text style={styles.actualLabel}>
            {hasStart ? `Started ${formatMinutes(entry.actualStart!)}` : 'Actual start'}
          </Text>
        </View>
        {!hasStart && (
          <View style={styles.actionBtns}>
            <Pressable style={styles.nowBtn} onPress={() => logNow('start')}>
              <Text style={styles.nowBtnText}>Now</Text>
            </Pressable>
            <Pressable style={styles.editBtn} onPress={() => openEditor('start')}>
              <Text style={styles.editBtnText}>Set time</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Actual end — only once started */}
      {hasStart && (
        <View style={styles.actualRow}>
          <View style={styles.actualLabelWrap}>
            {hasEnd ? <CheckCircle2 size={16} color={colors.success} /> : <Clock size={16} color={colors.textSecondary} />}
            <Text style={styles.actualLabel}>
              {hasEnd ? `Finished ${formatMinutes(entry.actualEnd!)}` : 'Actual finish'}
            </Text>
          </View>
          {!hasEnd && (
            <View style={styles.actionBtns}>
              <Pressable style={styles.nowBtn} onPress={() => logNow('end')}>
                <Text style={styles.nowBtnText}>Now</Text>
              </Pressable>
              <Pressable style={styles.editBtn} onPress={() => openEditor('end')}>
                <Text style={styles.editBtnText}>Set time</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {editing && (
        <View style={styles.editorWrap}>
          <Pressable style={styles.timePickerBtn} onPress={() => setPickerOpen(true)}>
            <Text style={styles.timePickerBtnText}>{formatMinutes(draftMinutes)}</Text>
          </Pressable>
          <View style={styles.editorFooter}>
            <Pressable style={styles.editorCancel} onPress={() => setEditing(null)}>
              <Text style={styles.editorCancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.editorConfirm} onPress={confirmDraft}>
              <Text style={styles.editorConfirmText}>
                {editing === 'start' ? 'Log start' : 'Log finish'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </GlassCard>

    <TimerSelectMenu
      visible={pickerOpen}
      onClose={() => setPickerOpen(false)}
      onTimeSelect={(date) => {
        const m = date.getHours() * 60 + date.getMinutes();
        setDraftMinutes(m);
      }}
      initialDate={(() => { const d = new Date(); d.setHours(Math.floor(draftMinutes / 60), draftMinutes % 60, 0, 0); return d; })()}
    />
    </>
  );
}

const styles = StyleSheet.create({
  stepCard: { padding: spacing.md },
  stepHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepTitle: {
    ...typography.cardTitle,
    color: colors.textPrimary,
  },
  trackBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  trackTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  plannedText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  timeText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  timeIcon: {
    marginHorizontal: 4,
  },
  actualRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,28,46,0.06)',
  },
  actualLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actualLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  actionBtns: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  nowBtn: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  nowBtnText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.white,
  },
  editBtn: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(28,28,46,0.06)',
  },
  editBtnText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  editorWrap: {
    marginTop: spacing.sm,
  },
  editorFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  editorCancel: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(28,28,46,0.06)',
  },
  editorCancelText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  editorConfirm: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  editorConfirmText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.white,
  },
  timePickerBtn: {
    backgroundColor: 'rgba(28,28,46,0.06)',
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  timePickerBtnText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
