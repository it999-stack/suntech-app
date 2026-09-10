// src/components/plan/actual/ReplanPromptSheet.tsx
//
// Shown after a step is paused: what the rest of the day would look like if
// the remaining work were rescheduled now.
//
// Deliberately shows the resulting TIMES rather than just asking "re-plan?".
// A mid-day edit reshuffles every machine's queue, and the supervisor is the
// only one who knows whether that matches what is actually happening on site —
// they can't judge that from a yes/no.

import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { CalendarClock } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import Button from '@components/shared/Button';
import { colors, spacing, radius, typography } from '@theme/theme';
import { formatTime } from '@utils/formatTime';
import type { EditPlanPreview } from '@state/PlanContext';

interface Props {
  visible: boolean;
  preview: EditPlanPreview;
  isApplying?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ReplanPromptSheet({ visible, preview, isApplying, onClose, onConfirm }: Props) {
  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title="Re-plan remaining work?"
      subtitle="The rest of this step, and everything queued behind it, would be rescheduled"
      position="bottom"
      scrollable
    >
      <View style={styles.body}>
        <ScrollView style={styles.list} nestedScrollEnabled>
          {preview.piles.map((pile) => (
            <View key={pile.pileId} style={styles.pileBlock}>
              <View style={styles.pileHeader}>
                <Text style={styles.pileCode}>{pile.pileIdCode}</Text>
                {/* The scheduler could not fit every applicable step in the
                    remaining window — worth knowing BEFORE committing, since
                    the dropped steps carry to another day. */}
                {!pile.isPlanComplete && (
                  <Text style={styles.incomplete}>
                    {pile.steps.length}/{pile.totalApplicableSteps} steps fit today
                  </Text>
                )}
              </View>

              {pile.steps.map((step) => (
                <View key={step.stepId} style={styles.stepRow}>
                  <Text style={styles.stepName} numberOfLines={1}>
                    {step.stepName}
                  </Text>
                  <Text style={styles.stepTime}>
                    {step.plannedStart ? formatTime(step.plannedStart) : '—'}
                    {' → '}
                    {/* Null end means the step runs past the plan window; it
                        has no committed finish, same as anywhere else. */}
                    {step.plannedEnd ? formatTime(step.plannedEnd) : 'continues'}
                  </Text>
                </View>
              ))}
            </View>
          ))}

          {preview.pilesLockedSkipped.length > 0 && (
            <Text style={styles.note}>
              Left untouched (work in progress): {preview.pilesLockedSkipped.join(', ')}
            </Text>
          )}
          {preview.warningPiles.length > 0 && (
            <Text style={styles.warning}>
              No room left today for: {preview.warningPiles.join(', ')}
            </Text>
          )}
        </ScrollView>

        <View style={styles.actions}>
          {/* "Not now" rather than "Cancel": the pause is already saved, and
              declining only leaves the plan stale — it undoes nothing. */}
          <Button label="Not now" variant="secondary" onPress={onClose} disabled={isApplying} />
          <Button
            label="Re-plan"
            icon={CalendarClock}
            onPress={onConfirm}
            loading={isApplying}
            disabled={isApplying}
          />
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.lg },
  list: { maxHeight: 340 },
  pileBlock: {
    gap: spacing.xs,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.glassFillStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pileHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pileCode: { ...typography.caption, fontWeight: '700', color: colors.textPrimary },
  incomplete: { ...typography.smallTxt, color: colors.warning },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  stepName: { ...typography.smallTxt, color: colors.textSecondary, flex: 1 },
  stepTime: { ...typography.smallTxt, color: colors.textPrimary, fontWeight: '600' },
  note: { ...typography.smallTxt, color: colors.textSecondary, marginTop: spacing.xs },
  warning: { ...typography.smallTxt, color: colors.warning, marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
});
