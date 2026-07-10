// src/components/plan/generate/steps/StartTimeStep.tsx
//
// Step 2 — the user picks a plan date and start time.
// Start time is selected via the shared TimeStepper (− / + 30 min, tap-to-type).
// The 24-hour plan window is shown live above the pickers.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Calendar, Clock } from 'lucide-react-native';
import GlassCard from '@components/shared/GlassCard';
import TimeStepper from '@components/shared/TimeStepper';
import { colors, spacing, radius, typography } from '@/theme/theme';
import { type PlanDraft, planEndTime, fmtPlanTime } from '@/types/plan';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Convert an ISO timestamp to minutes-since-midnight (local). */
function isoToMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** Build an ISO timestamp from a YYYY-MM-DD date string and minutes-since-midnight. */
function minutesToIso(date: string, mins: number): string {
  const [y, mo, d] = date.split('-').map(Number);
  const clampedMins = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(clampedMins / 60);
  const m = clampedMins % 60;
  const dt = new Date(y, mo - 1, d, h, m, 0, 0);
  return dt.toISOString();
}

// ─── Component ────────────────────────────────────────────────────────────────

interface StartTimeStepProps {
  draft: PlanDraft;
  onUpdate: (patch: Partial<PlanDraft>) => void;
}

export default function StartTimeStep({ draft, onUpdate }: StartTimeStepProps) {
  const today = toLocalDateStr(new Date());
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toLocalDateStr(d);
  })();

  const currentMinutes = isoToMinutes(draft.planStartTime);
  const endIso = planEndTime(draft.planStartTime);

  function selectDate(date: string) {
    // Keep the same time-of-day when switching date
    onUpdate({ date, planStartTime: minutesToIso(date, currentMinutes) });
  }

  function handleTimeChange(mins: number) {
    onUpdate({ planStartTime: minutesToIso(draft.date, mins) });
  }

  return (
    <>
      {/* 24-hour window banner */}
      <GlassCard innerStyle={styles.bannerPad}>
        <View style={styles.bannerRow}>
          <Clock size={18} color={colors.accent} />
          <Text style={styles.bannerLabel}>24-Hour Plan Window</Text>
        </View>
        <View style={styles.windowRow}>
          <View style={styles.windowBlock}>
            <Text style={styles.windowTime}>{fmtPlanTime(draft.planStartTime)}</Text>
            <Text style={styles.windowSub}>Start</Text>
          </View>
          <Text style={styles.windowArrow}>→</Text>
          <View style={styles.windowBlock}>
            <Text style={styles.windowTime}>{fmtPlanTime(endIso)}</Text>
            <Text style={styles.windowSub}>End (+24 h)</Text>
          </View>
        </View>
      </GlassCard>

      {/* Date selection */}
      <GlassCard innerStyle={styles.sectionPad}>
        <View style={styles.sectionHeader}>
          <Calendar size={16} color={colors.accent} />
          <Text style={styles.sectionLabel}>Plan Date</Text>
        </View>
        <View style={styles.chipRow}>
          {[today, tomorrow].map((d) => (
            <Pressable
              key={d}
              style={[styles.dateChip, draft.date === d && styles.dateChipActive]}
              onPress={() => selectDate(d)}
            >
              <Text style={[styles.dateChipText, draft.date === d && styles.dateChipTextActive]}>
                {d === today ? 'Today' : 'Tomorrow'}
              </Text>
              <Text style={[styles.dateChipSub, draft.date === d && styles.dateChipSubActive]}>
                {d}
              </Text>
            </Pressable>
          ))}
        </View>
      </GlassCard>

      {/* Time picker — reuses TimeStepper */}
      <TimeStepper
        label="Start Time"
        minutes={currentMinutes}
        onChange={handleTimeChange}
        step={30}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bannerPad: { padding: spacing.lg },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  bannerLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  windowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  windowBlock: { flex: 1 },
  windowTime: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  windowSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  windowArrow: {
    ...typography.h2,
    color: colors.textSecondary,
  },

  sectionPad: { padding: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  chipRow: { flexDirection: 'row', gap: spacing.sm },
  dateChip: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: 'rgba(28,28,46,0.06)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  dateChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  dateChipText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  dateChipTextActive: { color: colors.accent },
  dateChipSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dateChipSubActive: { color: colors.accent },
});