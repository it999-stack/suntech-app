// src/state/SiteSettingsContext.tsx
//
// Shifts and non-working windows are loaded from local SQLite.
// Mutations write-through to SQLite immediately so the data survives
// app restarts and can be pushed to the server by SyncShiftsStep.

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Shift, NonWorkingWindow, DiaDepthTemplate } from '../types/siteSettings';
import { getDimensionsBySite } from '../repositories/dimensionsRepository';
import {
  getAllShiftTypes,
  getNonWorkingWindowsBySite,
  upsertShiftType,
  deleteShiftType,
  upsertNonWorkingWindow,
  deleteNonWorkingWindow,
} from '../repositories/shiftsRepository';
import { useAuthStore } from '../store/authStore';

/** Convert "HH:MM" string to minutes-since-midnight. */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

type SiteSettingsContextValue = {
  shifts: Shift[];
  windows: NonWorkingWindow[];
  templates: DiaDepthTemplate[];
  addShift: (input: Omit<Shift, 'id'>) => void;
  updateShift: (id: string, input: Partial<Omit<Shift, 'id'>>) => void;
  deleteShift: (id: string) => void;
  windowsForShift: (shiftId: string) => NonWorkingWindow[];
  addWindow: (input: Omit<NonWorkingWindow, 'id'>) => void;
  deleteWindow: (id: string) => void;
  addTemplate: (input: Omit<DiaDepthTemplate, 'id'>) => void;
  deleteTemplate: (id: string) => void;
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
      // Shift types
      const shiftRows = await getAllShiftTypes();
      setShifts(
        shiftRows.map((s) => ({
          id: s.id,
          name: s.name,
          startMinutes: timeToMinutes(s.startTime),
          endMinutes: timeToMinutes(s.endTime),
        }))
      );
    } catch (err) {
      console.warn('[SiteSettings] Failed to load shift types from DB:', err);
      setShifts([]);
    }

    try {
      // Non-working windows for this site
      const windowRows = await getNonWorkingWindowsBySite(siteId);
      setWindows(
        windowRows.map((w) => ({
          id: w.id,
          shiftId: w.shiftTypeId,
          label: w.label,
          startMinutes: timeToMinutes(w.startTime),
          endMinutes: timeToMinutes(w.endTime),
        }))
      );
    } catch (err) {
      console.warn('[SiteSettings] Failed to load non-working windows from DB:', err);
      setWindows([]);
    }

    try {
      // Dia/depth templates
      const dimRows = await getDimensionsBySite(siteId);
      setTemplates(
        dimRows.map((d) => ({
          id: d.id,
          dia: d.dia,
          depth: d.depth,
          stepCount: 0, // TODO: derive from duration templates once synced
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

  // ─── Write-through mutations (update in-memory state + persist to SQLite) ─

  /** Helper: convert minutes-since-midnight → "HH:MM" */
  function minutesToTime(m: number): string {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  const addShift = (input: Omit<Shift, 'id'>) => {
    const id = `shift-${Date.now()}`;
    const newShift: Shift = { ...input, id };
    setShifts((prev) => [...prev, newShift]);
    // Write-through to SQLite
    upsertShiftType({
      id,
      name: input.name,
      startTime: minutesToTime(input.startMinutes),
      endTime: minutesToTime(input.endMinutes),
      syncedAt: Date.now(),
    }).catch((err) => console.warn('[SiteSettings] Failed to persist shift type:', err));
  };

  const updateShift = (id: string, input: Partial<Omit<Shift, 'id'>>) => {
    setShifts((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const updated = { ...s, ...input };
        // Write-through to SQLite
        upsertShiftType({
          id,
          name: updated.name,
          startTime: minutesToTime(updated.startMinutes),
          endTime: minutesToTime(updated.endMinutes),
          syncedAt: Date.now(),
        }).catch((err) => console.warn('[SiteSettings] Failed to update shift type:', err));
        return updated;
      })
    );
  };

  const deleteShift = (id: string) => {
    setShifts((prev) => prev.filter((s) => s.id !== id));
    setWindows((prev) => prev.filter((w) => w.shiftId !== id));
    // Write-through to SQLite (also cascades windows in the repo)
    deleteShiftType(id).catch((err) =>
      console.warn('[SiteSettings] Failed to delete shift type:', err)
    );
  };

  const windowsForShift = (shiftId: string) => windows.filter((w) => w.shiftId === shiftId);

  const addWindow = (input: Omit<NonWorkingWindow, 'id'>) => {
    const id = `window-${Date.now()}`;
    const newWindow: NonWorkingWindow = { ...input, id };
    setWindows((prev) => [...prev, newWindow]);
    // Write-through to SQLite
    upsertNonWorkingWindow({
      id,
      siteId: user?.siteId ?? '',
      shiftTypeId: input.shiftId,
      label: input.label,
      startTime: minutesToTime(input.startMinutes),
      endTime: minutesToTime(input.endMinutes),
      syncedAt: Date.now(),
    }).catch((err) => console.warn('[SiteSettings] Failed to persist non-working window:', err));
  };

  const deleteWindow = (id: string) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
    // Write-through to SQLite
    deleteNonWorkingWindow(id).catch((err) =>
      console.warn('[SiteSettings] Failed to delete non-working window:', err)
    );
  };

  const addTemplate = (input: Omit<DiaDepthTemplate, 'id'>) => {
    setTemplates((prev) => [...prev, { ...input, id: `template-${Date.now()}` }]);
  };

  const deleteTemplate = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const value = useMemo<SiteSettingsContextValue>(
    () => ({
      shifts,
      windows,
      templates,
      addShift,
      updateShift,
      deleteShift,
      windowsForShift,
      addWindow,
      deleteWindow,
      addTemplate,
      deleteTemplate,
      reloadFromDb,
    }),
    [shifts, windows, templates]
  );

  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings() {
  const ctx = useContext(SiteSettingsContext);
  if (!ctx) throw new Error('useSiteSettings must be used within a SiteSettingsProvider');
  return ctx;
}
