// src/components/plan/generate/GeneratePlanCalendarSheet.tsx
//
// Generate-Plan-specific date picker. Owns all day-classification rules
// (locked/planned/selectable) via `getDayState` — the generic AppCalendar it
// wraps stays ignorant of plans/checklists entirely.
//
// Only today and tomorrow are ever valid generation targets (see
// plan_generation_service.py's date + shift-grace-window rule), so plan
// existence is checked against the server (GET /plans/state), not local
// SQLite — a reinstalled/data-cleared device has nothing locally to go on,
// and must not be allowed to assume "no local row" means "no plan exists."
// Whenever the server confirms a plan exists, its full data is hydrated into
// local SQLite immediately (hydrateChecklistFromServer) so the rest of the
// generate/edit flow — which does read from local SQLite — has real data to
// work with.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { addDays } from 'date-fns';
import AppModal from '@components/shared/AppModal';
import AppCalendar, { type DayVisualState } from '@components/shared/AppCalendar';
import { colors, spacing, radius, typography } from '@theme/theme';
import { apiClient } from '@services/apiClient';
import { hydrateChecklistFromServer } from '@repositories/checklistRepository';
import { getAllShiftTypes } from '@repositories/shiftsRepository';
import { getPrimaryShiftType, combineDateAndTime, isWithinGenerationGrace } from '@utils/shiftHelpers';
import { fmtPlanTime, planEndTime } from '@/types/plan';
import { FUTURE_DAYS_AHEAD, ALLOW_ANY_PLAN_DATE } from '@/constants/planGeneration';

const DEFAULT_START_TIME = '08:00';

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatHeaderDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', {
    month: 'long',
    day: 'numeric',
  });
}

interface Props {
  visible: boolean;
  onClose: () => void;
  siteId: string;
  /** Called with the chosen date and whether it already has a plan (edit vs. new). */
  onConfirm: (date: string, hasExistingPlan: boolean) => void;
}

export default function GeneratePlanCalendarSheet({ visible, onClose, siteId, onConfirm }: Props) {
  // Recomputed each time the sheet opens (keyed on `visible`) rather than once
  // at mount, so a day boundary crossed while the app stays open doesn't leave
  // this stuck on a stale "today."
  const today = useMemo(() => toLocalDateStr(new Date()), [visible]);
  const rangeDates = useMemo(
    () => Array.from({ length: FUTURE_DAYS_AHEAD + 1 }, (_, i) => toLocalDateStr(addDays(new Date(), i))),
    [visible],
  );

  const [selectedDate, setSelectedDate] = useState(today);
  const [plannedDates, setPlannedDates] = useState<Set<string>>(new Set());
  const [planStartTimeOfDay, setPlanStartTimeOfDay] = useState(DEFAULT_START_TIME);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSelectedDate(today);
    setLoadError(null);
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [stateResponses, shiftTypes] = await Promise.all([
          Promise.all(
            rangeDates.map((d) =>
              apiClient.get<{ exists: boolean; checklist_id: string | null }>(
                `/piling/sites/${siteId}/plans/state`,
                { params: { date: d } },
              ),
            ),
          ),
          getAllShiftTypes(),
        ]);
        if (cancelled) return;

        const planned = new Set<string>();
        await Promise.all(
          stateResponses.map(async ({ data }, i) => {
            if (!data.exists || !data.checklist_id) return;
            planned.add(rangeDates[i]);
            // Server confirmed a plan exists — pull it down and cache it
            // locally right away, so if the user continues into edit mode,
            // GeneratePlanScreen has real data to seed from even on a device
            // that has nothing for this date locally (e.g. post-reinstall).
            const { data: fullChecklist } = await apiClient.get(`/piling/checklists/${data.checklist_id}`);
            await hydrateChecklistFromServer(fullChecklist);
          }),
        );
        if (cancelled) return;
        setPlannedDates(planned);

        const siteShifts = shiftTypes.filter((s) => s.siteId === siteId);
        const primary = getPrimaryShiftType(siteShifts);
        const startTime = primary?.startTime ?? DEFAULT_START_TIME;
        setPlanStartTimeOfDay(startTime);

        // Don't default the selection onto "today" if it's neither planned
        // nor still within its own generation grace window — land on
        // tomorrow instead, which is always open.
        const todayUsable = planned.has(today) || isWithinGenerationGrace(today, startTime);
        if (!todayUsable && rangeDates[1]) setSelectedDate(rangeDates[1]);
      } catch {
        if (!cancelled) {
          setLoadError('Could not reach the server. Connect to generate or edit a plan.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, siteId, rangeDates, today]);

  function getDayState(dateStr: string): DayVisualState {
    const idx = rangeDates.indexOf(dateStr);
    if (idx === -1 && !ALLOW_ANY_PLAN_DATE) return { disabled: true };

    if (plannedDates.has(dateStr)) {
      return {
        selected: dateStr === selectedDate,
        tone: 'primary',
        marker: <View style={styles.plannedDot} />,
        a11yLabel: 'Planned',
      };
    }

    // A failed server check always disables — no offline guessing, even in
    // ALLOW_ANY_PLAN_DATE testing mode.
    if (loadError) {
      return { disabled: true, tone: 'muted', a11yLabel: 'Unavailable' };
    }

    // TESTING: ALLOW_ANY_PLAN_DATE skips the "today's shift grace window has
    // closed" restriction below. Remove this bypass along with the constant
    // once testing is done.
    if (ALLOW_ANY_PLAN_DATE) {
      return { selected: dateStr === selectedDate, tone: 'default' };
    }

    // "Today" closes once its own shift's generation grace window has
    // passed; "tomorrow" is always open (its shift hasn't started yet).
    if (!isWithinGenerationGrace(dateStr, planStartTimeOfDay)) {
      return { disabled: true, tone: 'muted', a11yLabel: 'Window closed' };
    }

    return { selected: dateStr === selectedDate, tone: 'default' };
  }

  const selectedDisabled = getDayState(selectedDate).disabled === true;

  const planWindowStart = combineDateAndTime(selectedDate, planStartTimeOfDay);
  const planWindowEnd = planEndTime(planWindowStart);

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title="Select Date"
      subtitle="Choose which day's plan to generate"
    >
      <AppCalendar
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        getDayState={getDayState}
        initialMonth={today}
        legend={[
          { tone: 'default', label: 'Ready' },
          { tone: 'primary', label: 'Planned' },
          { tone: 'muted', label: 'Window closed' },
        ]}
      />

      <View style={styles.windowCard}>
        <Text style={styles.windowLabel}>SELECTED DATE</Text>
        <Text style={styles.windowDate}>{formatHeaderDate(selectedDate)}</Text>
        <Text style={styles.windowRange}>
          Plan window: {fmtPlanTime(planWindowStart)} → {fmtPlanTime(planWindowEnd)}
        </Text>
      </View>

      {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

      <Pressable
        style={[styles.confirmBtn, (loading || loadError || selectedDisabled) && styles.confirmBtnDisabled]}
        disabled={loading || !!loadError || selectedDisabled}
        onPress={() => onConfirm(selectedDate, plannedDates.has(selectedDate))}
      >
        <Text style={styles.confirmBtnText}>Continue with {formatShortDate(selectedDate)}</Text>
      </Pressable>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  errorText: {
    ...typography.caption,
    color: colors.danger,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  windowCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  windowLabel: {
    ...typography.label,
    color: colors.textSecondary,
    letterSpacing: 0.6,
  },
  windowDate: {
    ...typography.h2,
    color: colors.textPrimary,
    marginTop: 2,
  },
  windowRange: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  plannedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  confirmBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    ...typography.buttonLabel,
    color: colors.textInverse,
  },
});
