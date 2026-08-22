// src/components/shared/NativeTimerSelectMenu.tsx
//
// Same job as TimerSelectMenu's 'time' mode — pick a date+time for a start/
// finish entry — but built on the native react-native-date-picker wheel
// instead of the hand-rolled Reanimated one, for a side-by-side comparison.
// Kept to the props StepTimeControl/EditTimeButton actually use so it's a
// drop-in swap for those two call sites.

import React, { useMemo } from 'react';
import DatePicker from 'react-native-date-picker';
import { toLocalDateStr } from '@utils/formatTime';
import { pastOrTodayDateRule, type DateRule } from '@utils/validationRules';
import { colors } from '@theme/theme';

interface NativeTimerSelectMenuProps {
  visible: boolean;
  onClose: () => void;
  onTimeSelect?: (date: Date) => void;
  initialDate?: Date;
  /**
   * Fires on Confirm with the selected date and whether the user landed on a
   * different calendar day than `initialDate` — mirrors TimerSelectMenu's
   * onConfirm signature so callers don't need to branch on which picker is
   * mounted.
   */
  onConfirm?: (date: Date, dateWasExplicit: boolean) => void;
  title?: string;
  /** When false, the day is locked to `initialDate` and only time-of-day is pickable. Defaults to true. */
  allowDateChange?: boolean;
  /** Same DateRule shape as TimerSelectMenu — converted to min/max bounds below. Defaults to `pastOrTodayDateRule`. */
  dateRule?: DateRule;
  /**
   * Explicit bounds, used as-is instead of deriving from `dateRule` when
   * provided — for a precise timestamp window (e.g. a checklist's plan
   * window) that a whole-day DateRule can't express. Either may be passed
   * alone.
   */
  minimumDate?: Date;
  maximumDate?: Date;
}

/**
 * Converts a DateRule's per-day predicate into min/max Date bounds by
 * probing yesterday/today/tomorrow — enough to cover this app's two actual
 * rules (an open-ended past cutoff, and a today/tomorrow window) without the
 * picker needing to understand arbitrary predicates.
 */
function dateRuleToBounds(rule: DateRule): { minimumDate?: Date; maximumDate?: Date } {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const endOfTomorrow = new Date(endOfToday.getTime() + 24 * 60 * 60 * 1000);

  const yesterdayStr = toLocalDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const todayStr = toLocalDateStr(now);
  const tomorrowStr = toLocalDateStr(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  const allowsYesterday = rule.isAllowed(yesterdayStr);
  const allowsToday = rule.isAllowed(todayStr);
  const allowsTomorrow = rule.isAllowed(tomorrowStr);

  return {
    minimumDate: !allowsYesterday && allowsToday ? startOfToday : undefined,
    maximumDate: allowsTomorrow ? endOfTomorrow : allowsToday ? endOfToday : undefined,
  };
}

export default function NativeTimerSelectMenu({
  visible,
  onClose,
  onTimeSelect,
  initialDate,
  onConfirm,
  title,
  allowDateChange = true,
  dateRule = pastOrTodayDateRule,
  minimumDate: explicitMinimumDate,
  maximumDate: explicitMaximumDate,
}: NativeTimerSelectMenuProps) {
  const seedDate = useMemo(() => initialDate ?? new Date(), [initialDate]);
  const { minimumDate, maximumDate } = useMemo(() => {
    if (explicitMinimumDate || explicitMaximumDate) {
      return { minimumDate: explicitMinimumDate, maximumDate: explicitMaximumDate };
    }
    return allowDateChange ? dateRuleToBounds(dateRule) : {};
  }, [allowDateChange, dateRule, explicitMinimumDate, explicitMaximumDate]);

  function handleConfirm(date: Date) {
    const dateWasExplicit = allowDateChange && toLocalDateStr(date) !== toLocalDateStr(seedDate);
    onClose();
    setTimeout(() => {
      onTimeSelect?.(date);
      onConfirm?.(date, dateWasExplicit);
    }, 50);
  }

  return (
    <DatePicker
      modal
      open={visible}
      date={seedDate}
      mode={allowDateChange ? 'datetime' : 'time'}
      title={title}
      minimumDate={minimumDate}
      maximumDate={maximumDate}
      confirmText="Confirm"
      cancelText="Cancel"
      onConfirm={handleConfirm}
      onCancel={onClose}
      theme="light"
      dividerColor={colors.border}
      buttonColor={colors.accent}
    />
  );
}
