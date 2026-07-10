// src/types/siteSettings.ts

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
};

export type DiaDepthTemplate = {
  id: string;
  dia: number;
  depth: number;
  stepCount: number;
};

/** Duration in minutes, correctly handling an overnight shift that wraps past midnight. */
export function shiftDurationMinutes(shift: Shift): number {
  const raw = shift.endMinutes - shift.startMinutes;
  return raw > 0 ? raw : raw + 1440;
}