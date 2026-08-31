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
import { View, Text, StyleSheet } from 'react-native';
import { addDays } from 'date-fns';
import AppModal from '@components/shared/AppModal';
import Button from '@components/shared/Button';
import AppCalendar, { type DayVisualState } from '@components/shared/AppCalendar';
import { colors, spacing, typography } from '@theme/theme';
import { apiClient } from '@services/apiClient';
import { hydrateChecklistFromServer } from '@repositories/checklistRepository';
import { getAllShiftTypes } from '@repositories/shiftsRepository';
import { getPrimaryShiftType, combineDateAndTime, isWithinGenerationGrace } from '@utils/shiftHelpers';
import { toLocalDateStr, formatHeaderDate } from '@utils/formatTime';
import { fmtPlanTime, planEndTime } from '@/types/plan';
import { useAppConfig } from '@state/AppConfigContext';
import { useWorkingDate, useWorkingDateStore } from '@store/workingDateStore';

const DEFAULT_START_TIME = '08:00';

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
  const { config } = useAppConfig();
  // TESTING ONLY: when a tester has the working-date override on (see
  // workingDateStore.ts), this sheet should default/anchor to that date
  // instead of the device's real today — same "operate on the picked date"
  // behavior WorkingDateSheet already promises for Home/Fill Actuals.
  const workingDate = useWorkingDate();
  const workingDateOverrideEnabled = useWorkingDateStore((s) => s.overrideEnabled);
  // isWithinGenerationGrace always compares against the device's real clock,
  // so a picked working date that isn't real-today would otherwise look
  // "closed" and get silently bumped to tomorrow — the override means "let me
  // freely operate on this exact date," same intent allowAnyPlanDate already
  // carries elsewhere in this file, so it's folded into the same bypass.
  const testingModeActive = workingDateOverrideEnabled || config.allowAnyPlanDate;

  // Recomputed each time the sheet opens (keyed on `visible`) rather than once
  // at mount, so a day boundary crossed while the app stays open doesn't leave
  // this stuck on a stale "today."
  const today = useMemo(() => workingDate, [visible, workingDate]);
  const rangeDates = useMemo(
    () =>
      Array.from({ length: config.futureDaysAhead + 1 }, (_, i) =>
        toLocalDateStr(addDays(new Date(`${workingDate}T00:00:00`), i)),
      ),
    [visible, config.futureDaysAhead, workingDate],
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
        // tomorrow instead, which is always open. Skipped entirely in
        // testing mode — the whole point there is to stay on the exact date
        // picked/overridden, not have it second-guessed against real-world time.
        const todayUsable =
          testingModeActive ||
          planned.has(today) ||
          isWithinGenerationGrace(today, startTime, config.generationGraceHours);
        if (!todayUsable && rangeDates[1]) setSelectedDate(rangeDates[1]);
      } catch {
        if (!cancelled) {
          setLoadError('Sync failed - Please try again later.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, siteId, rangeDates, today, config.generationGraceHours, testingModeActive]);

  function getDayState(dateStr: string): DayVisualState {
    const idx = rangeDates.indexOf(dateStr);
    if (idx === -1 && !testingModeActive) return { disabled: true };

    if (plannedDates.has(dateStr)) {
      return {
        selected: dateStr === selectedDate,
        tone: 'primary',
        marker: <View style={styles.plannedDot} />,
        a11yLabel: 'Planned',
      };
    }

    // A failed server check always disables — no offline guessing, even in
    // testing mode.
    if (loadError) {
      return { disabled: true, tone: 'muted', a11yLabel: 'Unavailable' };
    }

    if (testingModeActive) {
      return { selected: dateStr === selectedDate, tone: 'default' };
    }

    // "Today" closes once its own shift's generation grace window has
    // passed; "tomorrow" is always open (its shift hasn't started yet).
    if (!isWithinGenerationGrace(dateStr, planStartTimeOfDay, config.generationGraceHours)) {
      return { disabled: true, tone: 'muted', a11yLabel: 'Window closed' };
    }

    return { selected: dateStr === selectedDate, tone: 'default' };
  }

  const selectedDisabled = getDayState(selectedDate).disabled === true;

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      position="center"
      title="Select Time"
      subtitle="Choose which day's plan to generate"
    >
      <AppCalendar
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        getDayState={getDayState}
        initialMonth={today}
        legend={[]}
      />

      {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

      <Button
        label={`Continue with ${formatShortDate(selectedDate)}`}
        loading={loading}
        disabled={loading || !!loadError || selectedDisabled}
        onPress={() => onConfirm(selectedDate, plannedDates.has(selectedDate))}
        style={styles.confirmBtn}
      />
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
  plannedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  confirmBtn: { marginTop: spacing.lg },
});
