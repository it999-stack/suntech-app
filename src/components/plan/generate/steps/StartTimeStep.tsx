// src/components/plan/generate/steps/StartTimeStep.tsx
//
// Step 2 — the user picks a plan start time.
// Two blocks now: a compact pressable "Start" card (date + time, opens
// NativeTimerSelectMenu), and below it a vertical timeline card that
// visualizes the fixed 24-hour span down to the derived end.

import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Calendar, Pencil, Clock, Briefcase, HardHat } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import AppModal from '@components/shared/AppModal';
import PersonnelPickerList, { type SimplePersonnel } from '@components/shared/PersonnelPickerList';
import TimerSelectMenu from '@/components/shared/NativeTimerSelectMenu';
import { TimelineStopLog } from '@/components/shared/timeline/MachineStopTimeline';
import { colors, spacing, radius, typography } from '@/theme/theme';
import { type PlanDraft, planEndTime } from '@/types/plan';
import type { TimelineStop } from '@/types/timeline';
import { matchesRoleDesignation } from '@/utils/personnelRoles';
import { formatTime, toLocalIsoString, toLocalDateStr, formatRelativeDayLabel } from '@/utils/formatTime';
import { planGenerationDateRule } from '@/utils/validationRules';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtPlanDate = (iso: string) =>
  formatRelativeDayLabel(iso, { neighbor: 'tomorrow', dateFormatOptions: { month: 'short', day: 'numeric' } });

// ─── Component ────────────────────────────────────────────────────────────────

interface StartTimeStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
  personnel: SimplePersonnel[];
}

function RolePickerCard({
  icon,
  label,
  personnel,
  selectedId,
  onSelect,
  allowNone = false,
}: {
  icon: React.ReactNode;
  label: string;
  personnel: SimplePersonnel[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  allowNone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = personnel.find((p) => p.id === selectedId);
  const isRequired = !selected && !allowNone;

  return (
    <>
      <Pressable onPress={() => setOpen(true)}>
        {({ pressed }) => (
          <GlassCard
            innerStyle={[
              styles.startPad,
              isRequired && styles.startPadRequired,
              pressed && styles.startPadPressed,
            ]}
          >
            <View style={styles.startRow}>
              <View style={[styles.startIconWrap, isRequired && styles.startIconWrapRequired]}>
                {React.isValidElement(icon)
                  ? React.cloneElement(icon as React.ReactElement<{ color?: string }>, {
                      color: isRequired ? colors.warning : colors.accent,
                    })
                  : icon}
              </View>
              <View style={styles.startTextWrap}>
                <Text style={styles.startLabel}>{label}</Text>
                <Text style={[styles.startValue, isRequired && styles.startValueRequired]}>
                  {selected ? selected.name : 'Not assigned'}
                </Text>
              </View>
              <Pencil size={18} color={isRequired ? colors.warning : colors.textSecondary} />
            </View>
          </GlassCard>
        )}
      </Pressable>

      <AppModal visible={open} onClose={() => setOpen(false)} title={label} position="center">
        <PersonnelPickerList
          personnel={personnel}
          selectedId={selectedId}
          onSelect={(id) => {
            onSelect(id);
            setOpen(false);
          }}
          allowNone={allowNone}
        />
      </AppModal>
    </>
  );
}

export default function StartTimeStep({ draft, onUpdate, personnel }: StartTimeStepProps) {
  const endIso = planEndTime(draft.planStartTime);
  const [timePickerOpen, setTimePickerOpen] = useState(false);

  const projectManagers = useMemo(
    () => personnel.filter((p) => matchesRoleDesignation('PROJECT_MANAGER', p.designation)),
    [personnel],
  );
  const planningEngineers = useMemo(
    () => personnel.filter((p) => matchesRoleDesignation('PLANNING_ENGINEER', p.designation)),
    [personnel],
  );
  const windowStops = useMemo<TimelineStop[]>(
    () => [
      {
        id: 'plan-window',
        kind: 'active',
        kindLabel: 'Start',
        title: `${fmtPlanDate(draft.planStartTime)}, ${formatTime(draft.planStartTime)}`,
        start: new Date(draft.planStartTime).getTime(),
        end: new Date(endIso).getTime(),
      },
      {
        id: 'plan-end',
        kind: 'idle',
        kindLabel: 'End',
        title: `${fmtPlanDate(endIso)}, ${formatTime(endIso)}`,
        subtitle: 'Plan window ends automatically',
        showDuration: false,
        start: new Date(endIso).getTime(),
        end: new Date(endIso).getTime(),
      },
    ],
    [draft.planStartTime, endIso],
  );

  function handleTimeChange(picked: Date) {
    onUpdate({
      date: toLocalDateStr(picked),
      planStartTime: toLocalIsoString(picked),
    });
  }

  return (
    <>
      {/* Compact Start card — the single tap target that opens the wheel picker */}
      <Pressable onPress={() => setTimePickerOpen(true)}>
        {({ pressed }) => (
          <GlassCard innerStyle={[styles.startPad, pressed && styles.startPadPressed]}>
            <View style={styles.startRow}>
              <View style={styles.startIconWrap}>
                <Calendar size={20} color={colors.accent} />
              </View>
              <View style={styles.startTextWrap}>
                <Text style={styles.startLabel}>Start</Text>
                <Text style={styles.startValue}>
                  {fmtPlanDate(draft.planStartTime)}, {formatTime(draft.planStartTime)}
                </Text>
              </View>
              <Pencil size={18} color={colors.textSecondary} />
            </View>
          </GlassCard>
        )}
      </Pressable>

      <RolePickerCard
        icon={<Briefcase size={20} color={colors.accent} />}
        label="Project Manager"
        personnel={projectManagers}
        selectedId={draft.checklistPersonnel.projectManagerId}
        onSelect={(id) =>
          onUpdate({ checklistPersonnel: { ...draft.checklistPersonnel, projectManagerId: id } })
        }
      />

      <RolePickerCard
        icon={<HardHat size={20} color={colors.accent} />}
        label="Planning Engineer"
        personnel={planningEngineers}
        selectedId={draft.checklistPersonnel.planningEngineerId}
        onSelect={(id) =>
          onUpdate({ checklistPersonnel: { ...draft.checklistPersonnel, planningEngineerId: id } })
        }
        allowNone
      />

      {/* Uses the same stop-log component and card treatment as the machine timeline. */}
      <GlassCard borderless innerStyle={styles.timelinePad}>
        <View style={styles.timelineHeader}>
          <View style={styles.startIconWrap}>
            <Clock size={20} color={colors.accent} />
          </View>
          <View>
            <Text style={styles.timelineTitle}>Plan Timeline</Text>
            <Text style={styles.timelineSubtitle}>24-hour window</Text>
          </View>
        </View>
        <TimelineStopLog stops={windowStops} activeColor={colors.accent} />
      </GlassCard>

      <TimerSelectMenu
        visible={timePickerOpen}
        onClose={() => setTimePickerOpen(false)}
        onTimeSelect={handleTimeChange}
        initialDate={new Date(draft.planStartTime)}
        dateRule={planGenerationDateRule}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Start card
  startPad: { padding: spacing.lg },
  startPadRequired: {
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  startPadPressed: { backgroundColor: 'rgba(28,28,46,0.04)' },
  startRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  startIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startIconWrapRequired: {
    backgroundColor: 'rgba(255,149,0,0.16)',
  },
  startTextWrap: { flex: 1 },
  startLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  startValue: {
    ...typography.body,
    fontWeight: '700',
    fontSize: 17,
    color: colors.textPrimary,
  },
  startValueRequired: {
    color: colors.warning,
  },

  // Timeline card
  timelinePad: { padding: spacing.lg, marginTop: spacing.md },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  timelineTitle: { ...typography.body, fontWeight: '800', color: colors.textPrimary },
  timelineSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timelineRail: {
    width: 16,
    alignItems: 'center',
  },
  dotStart: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    marginTop: 4,
  },
  dotEnd: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: 'rgba(28,28,46,0.25)',
    marginBottom: 4,
  },
  railLine: {
    width: 1.5,
    flex: 1,
    minHeight: 18,
    backgroundColor: 'rgba(28,28,46,0.15)',
  },
  lockWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(28,28,46,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  timelineTextCol: {
    flex: 1,
    justifyContent: 'space-between',
  },
  timelineEntry: {},
  timelineEntryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  timelineEntryLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontSize: 11,
  },
  timelineEntryLabelMuted: { color: colors.textSecondary },
  timelineEntryValue: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  timelineEntryValueMuted: {
    color: colors.textSecondary,
    fontWeight: '500',
  },
  durationPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(28,28,46,0.05)',
    marginVertical: spacing.sm,
  },
  durationPillText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
});
