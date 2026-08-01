// src/types/siteSettings.ts

import type { NonWorkingWindowBehavior } from '@/db/schema';

export type Shift = {
  id: string;
  name: string;
  startMinutes: number; // minutes since midnight
  endMinutes: number;   // minutes since midnight — may wrap past 1440 conceptually (overnight shift)
};

export type NonWorkingWindow = {
  id: string;
  shiftId: string; // scoped to one shift, per the current schema
  label: string;
  startMinutes: number;
  endMinutes: number;
  /** How the planner treats this window: 'FIXED' (default) or 'AFTER_CURRENT_STEP'. */
  behavior: NonWorkingWindowBehavior;
};

/** Duration in minutes, correctly handling an overnight shift that wraps past midnight. */
export function shiftDurationMinutes(shift: Shift): number {
  const raw = shift.endMinutes - shift.startMinutes;
  return raw > 0 ? raw : raw + 1440;
}