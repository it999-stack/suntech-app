// src/components/plan/actual/StepFinishSheet.tsx
//
// Asked once the stop TIME has already been picked and validated by
// StepTimeControl: did the step finish, or did it stop part-way?
//
// Deliberately a second step rather than two separate buttons on the card.
// The supervisor's gesture is the same either way — "work stopped at 10:30" —
// and which of the two it was is a fact about the work, not a different
// action. Splitting it into "Finish" and "Pause" buttons would make them
// choose before they have entered the time.
//
// Two questions, and no more. Everything else about the pause is either
// derivable (how much work is left = template minus what was worked, see
// classify_piles) or belongs to a later moment (which machine picks it up is
// asked when the step is actually RESUMED, by which point it is known rather
// than guessed).

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput } from 'react-native';
import { CheckCircle2, PauseCircle } from 'lucide-react-native';
import AppModal from '@components/shared/AppModal';
import Button from '@components/shared/Button';
import RequiredMark from '@components/shared/RequiredMark';
import { colors, spacing, radius, typography } from '@theme/theme';
import { formatTime } from '@utils/formatTime';
import type { ActualEntry } from '@app-types/plan';

export type PauseInput = { notes: string };

interface Props {
  visible: boolean;
  step: ActualEntry;
  /** The already-picked, already-validated stop time. */
  stoppedAtIso: string;
  isSaving?: boolean;
  onClose: () => void;
  onCompleted: (notes: string) => void;
  onPaused: (input: PauseInput) => void;
}

export default function StepFinishSheet({
  visible,
  step,
  stoppedAtIso,
  isSaving,
  onClose,
  onCompleted,
  onPaused,
}: Props) {
  const [choice, setChoice] = useState<'completed' | 'paused' | null>(null);
  const [notes, setNotes] = useState('');

  const trimmedNotes = notes.trim();
  // Required only when PAUSING. A pause is an exception that someone will ask
  // about later, and the remark is now the only place its reason is recorded
  // — leaving it blank puts an unexplained gap in the report. Finishing a step
  // normally is the routine path and explains itself, so demanding a remark
  // there would just tax the most common action into being skipped.
  const notesRequired = choice === 'paused';
  const canSave = !!choice && (!notesRequired || trimmedNotes.length > 0) && !isSaving;

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={step.stepName}
      subtitle={`Work stopped at ${formatTime(stoppedAtIso)}`}
      showCloseButton={false}
      position="bottom"
      avoidKeyboard
      scrollable
    >
      <View style={styles.body}>
        <Text style={styles.question}>Is this step complete?</Text>

        <View style={styles.choiceRow}>
          <ChoiceCard
            active={choice === 'completed'}
            icon={CheckCircle2}
            tint={colors.success}
            label="Completed"
            hint="The step is finished"
            onPress={() => setChoice('completed')}
          />
          <ChoiceCard
            active={choice === 'paused'}
            icon={PauseCircle}
            tint={colors.warning}
            label="Paused"
            hint="Work remaining"
            onPress={() => setChoice('paused')}
          />
        </View>

        <View>
          <Text style={styles.fieldLabel}>
            Remarks
            {/* Only marked required on the pause path — showing it on a
                straight finish would claim a rule that isn't enforced. */}
            {notesRequired && <RequiredMark />}
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={notesRequired ? 'Why did work stop?' : 'Add remarks here...'}
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            multiline
          />
        </View>

        <Button
          label={choice === 'paused' ? 'Save & pause step' : 'Save'}
          variant={choice === 'paused' ? 'warning' : 'primary'}
          disabled={!canSave}
          loading={isSaving}
          onPress={() => {
            if (choice === 'completed') return onCompleted(trimmedNotes);
            if (choice === 'paused') onPaused({ notes: trimmedNotes });
          }}
        />
      </View>
    </AppModal>
  );
}

function ChoiceCard({
  active,
  icon: Icon,
  tint,
  label,
  hint,
  onPress,
}: {
  active: boolean;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  tint: string;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.choiceCard, active && { borderColor: tint, backgroundColor: `${tint}18` }]}
    >
      <Icon size={22} color={active ? tint : colors.textSecondary} />
      <Text style={[styles.choiceLabel, active && { color: tint }]}>{label}</Text>
      <Text style={styles.choiceHint}>{hint}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.lg },
  question: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  choiceRow: { flexDirection: 'row', gap: spacing.sm },
  choiceCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.glassFillStrong,
  },
  choiceLabel: { ...typography.caption, fontWeight: '700', color: colors.textPrimary },
  choiceHint: { ...typography.smallTxt, color: colors.textSecondary, textAlign: 'center' },
  fieldLabel: {
    ...typography.smallTxt,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.glassFillStrong,
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
