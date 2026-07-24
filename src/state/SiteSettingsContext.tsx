// src/state/SiteSettingsContext.tsx
//
// Shifts and non-working windows are loaded from local SQLite.
// This context is read-only — the server is the source of truth.

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Shift, NonWorkingWindow, DiaDepthTemplate } from '@app-types/siteSettings';
import type { NonWorkingWindowBehavior } from '@db/schema';
import { getDimensionsBySite } from '@repositories/dimensionsRepository';
import { getDurationTemplatesBySite } from '@repositories/durationTemplatesRepository';
import { getAllShiftsWithWindows, type ShiftWithWindows } from '@repositories/shiftsRepository';
import { useAuthStore } from '@store/authStore';

/** Convert "HH:MM" string to minutes-since-midnight. */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

type SiteSettingsContextValue = {
  shifts: Shift[];
  windows: NonWorkingWindow[];
  templates: DiaDepthTemplate[];
  /** Get windows for a specific shift (read-only). */
  windowsForShift: (shiftId: string) => NonWorkingWindow[];
  /** Re-load all site settings from local SQLite. Call after a sync completes. */
  reloadFromDb: (siteId: string) => Promise<void>;
};

const SiteSettingsContext = createContext<SiteSettingsContextValue | undefined>(undefined);

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [windows, setWindows] = useState<NonWorkingWindow[]>([]);
  const [templates, setTemplates] = useState<DiaDepthTemplate[]>([]);
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

    try {
      const [dimRows, durationTemplates] = await Promise.all([
        getDimensionsBySite(siteId),
        getDurationTemplatesBySite(siteId),
      ]);
      const stepCountsByDimensionId = new Map<string, number>();

      for (const template of durationTemplates) {
        stepCountsByDimensionId.set(
          template.dimensionId,
          (stepCountsByDimensionId.get(template.dimensionId) ?? 0) + 1,
        );
      }

      setTemplates(
        dimRows.map((d) => ({
          id: d.id,
          dia: d.dia,
          depth: d.depth,
          stepCount: stepCountsByDimensionId.get(d.id) ?? 0,
        }))
      );
    } catch (err) {
      console.warn('[SiteSettings] Failed to load dimensions from DB:', err);
      setTemplates([]);
    }
  };

  useEffect(() => {
    if (user?.siteId) {
      reloadFromDb(user.siteId);
    }
  }, [user?.siteId]);

  // ─── Read-only context ────────────────────────────────────────────────────

  const windowsForShift = useMemo(() => {
    return (shiftId: string) => windows.filter((w) => w.shiftId === shiftId);
  }, [windows]);

  const value = useMemo<SiteSettingsContextValue>(
    () => ({
      shifts,
      windows,
      templates,
      windowsForShift,
      reloadFromDb,
    }),
    [shifts, windows, templates, windowsForShift]
  );

  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings(): SiteSettingsContextValue {
  const ctx = useContext(SiteSettingsContext);
  if (!ctx) throw new Error('useSiteSettings must be used within a SiteSettingsProvider');
  return ctx;
}
