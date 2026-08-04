// src/state/SiteSettingsContext.tsx
//
// Shifts and non-working windows are loaded from local SQLite.
// This context is read-only — the server is the source of truth.

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Shift, NonWorkingWindow } from '@app-types/siteSettings';
import type { NonWorkingWindowBehavior } from '@db/schema';
import { getAllShiftsWithWindows, type ShiftWithWindows } from '@repositories/shiftsRepository';
import { useAuthStore } from '@store/authStore';
import { onDeltaSyncComplete } from '@sync/delta/runDeltaSync';
import { onBootstrapCompleted } from '@sync/bootstrap/bootstrapSync';

/** Convert "HH:MM" string to minutes-since-midnight. */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

type SiteSettingsContextValue = {
  shifts: Shift[];
  windows: NonWorkingWindow[];
  /** Get windows for a specific shift (read-only). */
  windowsForShift: (shiftId: string) => NonWorkingWindow[];
  /** Re-load all site settings from local SQLite. Call after a sync completes. */
  reloadFromDb: (siteId: string) => Promise<void>;
};

const SiteSettingsContext = createContext<SiteSettingsContextValue | undefined>(undefined);

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [windows, setWindows] = useState<NonWorkingWindow[]>([]);
  const user = useAuthStore((state) => state.user);

  // ─── Load from SQLite ────────────────────────────────────────────────────

  const reloadFromDb = async (siteId: string) => {
    try {
      // Load shifts with windows embedded
      const shiftsWithWindows: ShiftWithWindows[] = await getAllShiftsWithWindows(siteId);

      // Convert to UI types
      const shiftRows: Shift[] = [];
      const windowRows: NonWorkingWindow[] = [];

      for (const shift of shiftsWithWindows) {
        shiftRows.push({
          id: shift.id,
          name: shift.name,
          startMinutes: timeToMinutes(shift.startTime),
          endMinutes: timeToMinutes(shift.endTime),
        });

        // Windows are already scoped to this shift via getAllShiftsWithWindows
        for (const window of shift.windows) {
          windowRows.push({
            id: window.id,
            shiftId: window.shiftTypeId,
            label: window.label,
            startMinutes: timeToMinutes(window.startTime),
            endMinutes: timeToMinutes(window.endTime),
            behavior: window.behavior as NonWorkingWindowBehavior,
          });
        }
      }

      setShifts(shiftRows);
      setWindows(windowRows);
    } catch (err) {
      console.warn('[SiteSettings] Failed to load shifts from DB:', err);
      setShifts([]);
      setWindows([]);
    }
  };

  useEffect(() => {
    if (user?.siteId) {
      reloadFromDb(user.siteId);
    }
  }, [user?.siteId]);

  // Reload after every delta sync (automatic — reconnect/foreground/periodic
  // — or manual) so screens reading this context never show stale data just
  // because they weren't the ones that triggered the sync.
  useEffect(() => {
    return onDeltaSyncComplete(() => {
      if (user?.siteId) {
        reloadFromDb(user.siteId);
      }
    });
  }, [user?.siteId]);

  // Same, for the first-ever sync (bootstrap) — delta sync never runs until
  // a cursor exists, so this is the only completion signal before that.
  useEffect(() => {
    return onBootstrapCompleted(() => {
      if (user?.siteId) {
        reloadFromDb(user.siteId);
      }
    });
  }, [user?.siteId]);

  // ─── Read-only context ────────────────────────────────────────────────────

  const windowsForShift = useMemo(() => {
    return (shiftId: string) => windows.filter((w) => w.shiftId === shiftId);
  }, [windows]);

  const value = useMemo<SiteSettingsContextValue>(
    () => ({
      shifts,
      windows,
      windowsForShift,
      reloadFromDb,
    }),
    [shifts, windows, windowsForShift]
  );

  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings(): SiteSettingsContextValue {
  const ctx = useContext(SiteSettingsContext);
  if (!ctx) throw new Error('useSiteSettings must be used within a SiteSettingsProvider');
  return ctx;
}
