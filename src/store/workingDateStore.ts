// src/store/workingDateStore.ts
//
// TESTING ONLY: the "working date" is the day the app operates on for
// plan/actuals purposes. Normally it's just today. When a tester turns the
// override on and picks a date via WorkingDateSheet (reachable from Home's
// gear icon), every plan/actuals screen (Home, Generate Plan, Fill Actuals,
// the active-plan background sync) treats that date as the working date
// instead — letting the full generate → fill-actuals → next-day-resume
// lifecycle be exercised against any date, not just device-today.
//
// This is a manual runtime toggle (works in dev AND production builds) —
// remove/disable it yourself before real site use. A fresh install always
// starts with overrideEnabled: false, so this only matters for a
// device/build you personally reuse across testing and real use.

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { toLocalDateStr } from '@/utils/formatTime';

const OVERRIDE_ENABLED_KEY = 'working_date_override_enabled';
const OVERRIDE_DATE_KEY = 'working_date_override_date';

type WorkingDateState = {
  overrideEnabled: boolean;
  overrideDate: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setOverride: (enabled: boolean, date: string | null) => Promise<void>;
};

export const useWorkingDateStore = create<WorkingDateState>((set) => ({
  overrideEnabled: false,
  overrideDate: null,
  hydrated: false,

  // Called once at app startup (see App.tsx) so a persisted override
  // survives an app restart mid-testing-session.
  hydrate: async () => {
    const [enabledStr, date] = await Promise.all([
      SecureStore.getItemAsync(OVERRIDE_ENABLED_KEY),
      SecureStore.getItemAsync(OVERRIDE_DATE_KEY),
    ]);
    set({ overrideEnabled: enabledStr === 'true', overrideDate: date, hydrated: true });
  },

  setOverride: async (enabled: boolean, date: string | null) => {
    await Promise.all([
      SecureStore.setItemAsync(OVERRIDE_ENABLED_KEY, String(enabled)),
      date ? SecureStore.setItemAsync(OVERRIDE_DATE_KEY, date) : SecureStore.deleteItemAsync(OVERRIDE_DATE_KEY),
    ]);
    set({ overrideEnabled: enabled, overrideDate: date });
  },
}));

/** Hook form — reactive, for use in components. */
export function useWorkingDate(): string {
  const overrideEnabled = useWorkingDateStore((s) => s.overrideEnabled);
  const overrideDate = useWorkingDateStore((s) => s.overrideDate);
  return overrideEnabled && overrideDate ? overrideDate : toLocalDateStr(new Date());
}

/** Non-hook form — for plain modules (e.g. background sync steps). */
export function getWorkingDate(): string {
  const { overrideEnabled, overrideDate } = useWorkingDateStore.getState();
  return overrideEnabled && overrideDate ? overrideDate : toLocalDateStr(new Date());
}
