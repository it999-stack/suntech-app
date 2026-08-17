// src/utils/validationRules.ts
//
// App-level validation rules — a single place to define reusable validation
// predicates and their user-facing messages, instead of hardcoding ad hoc
// date-math/business-rule checks (and copy/tweaking messages) per screen.
// Add new rule groups here as the app needs more kinds of validation.

import { toLocalDateStr } from './formatTime';

// ─── Date rules ───────────────────────────────────────────────────────────────

export interface DateRule {
  /** Returns true when dateStr ("YYYY-MM-DD") should be selectable. */
  isAllowed: (dateStr: string) => boolean;
  /** User-facing explanation, shown near the picker when a rule restricts it. */
  message: string;
}

/** Today or earlier — for logging something that already happened (actual
 * start/finish times, machine events, resume close-out times). This is
 * TimerSelectMenu's default date rule when a caller doesn't specify one. */
export const pastOrTodayDateRule: DateRule = {
  isAllowed: (dateStr) => dateStr <= toLocalDateStr(new Date()),
  message: '',
};

/** Today or tomorrow only — mirrors suntech-core's plan_validation.py
 * _validate_generation_window exactly: "today" covers the forgot-to-plan-
 * ahead case, "tomorrow" covers planning the day before. Used by
 * StartTimeStep, the Generate Plan wizard's start-time picker. */
export const planGenerationDateRule: DateRule = {
  isAllowed: (dateStr) => {
    const today = toLocalDateStr(new Date());
    const tomorrow = toLocalDateStr(new Date(Date.now() + 24 * 60 * 60 * 1000));
    return dateStr === today || dateStr === tomorrow;
  },
  message: 'Plans may only be generated for today or tomorrow.',
};
