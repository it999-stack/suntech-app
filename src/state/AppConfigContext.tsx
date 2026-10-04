// src/state/AppConfigContext.tsx
//
// Server-managed constants (see suntech-core/modules/shared/app_config/
// constants.py), synced into the local `app_config` SQLite table and
// preloaded into memory here so components can read them synchronously.
// This context is read-only — the server is the source of truth. Not
// site-scoped, unlike SiteSettingsContext.tsx (whose "preload once, expose
// synchronously, reload on every sync completion" pattern this mirrors).

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getAllAppConfig } from '@repositories/appConfigRepository';
import { onDeltaSyncComplete } from '@sync/delta/runDeltaSync';
import { onBootstrapCompleted } from '@sync/bootstrap/bootstrapSync';

export type AppConfigValues = {
  pilesPageSize: number;
  pilesSearchDebounceMs: number;
  maxAutoPreselectPiles: number;
  generationGraceHours: number;
  noNewStepCutoffMinutes: number;
  planGenerateDaysBack: number;
  planGenerateDaysAhead: number;
  planEditDaysBack: number;
  planEditDaysAhead: number;
};

// Fallback for the window before the first sync ever completes (fresh
// install, no connectivity yet) — today's hardcoded values, so behavior is
// unchanged until a real sync lands.
const DEFAULTS: AppConfigValues = {
  pilesPageSize: 100,
  pilesSearchDebounceMs: 300,
  maxAutoPreselectPiles: 5,
  generationGraceHours: 2,
  noNewStepCutoffMinutes: 25,
  planGenerateDaysBack: 0,
  planGenerateDaysAhead: 1,
  planEditDaysBack: 0,
  planEditDaysAhead: 0,
};

// Maps the server's snake_case keys onto the camelCase fields above.
const KEY_MAP: Record<keyof AppConfigValues, string> = {
  pilesPageSize: 'piles_page_size',
  pilesSearchDebounceMs: 'piles_search_debounce_ms',
  maxAutoPreselectPiles: 'max_auto_preselect_piles',
  generationGraceHours: 'generation_grace_hours',
  noNewStepCutoffMinutes: 'no_new_step_cutoff_minutes',
  planGenerateDaysBack: 'plan_generate_days_back',
  planGenerateDaysAhead: 'plan_generate_days_ahead',
  planEditDaysBack: 'plan_edit_days_back',
  planEditDaysAhead: 'plan_edit_days_ahead',
};

type AppConfigContextValue = {
  config: AppConfigValues;
  /** Re-load config from local SQLite. Call after a sync completes. */
  reloadFromDb: () => Promise<void>;
};

const AppConfigContext = createContext<AppConfigContextValue | undefined>(undefined);

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfigValues>(DEFAULTS);

  const reloadFromDb = async () => {
    try {
      const raw = await getAllAppConfig();
      const next = { ...DEFAULTS };
      for (const field of Object.keys(KEY_MAP) as (keyof AppConfigValues)[]) {
        const value = raw[KEY_MAP[field]];
        // A missing/mistyped key (e.g. an older cached row before a server
        // change, or a key the running app doesn't know about) just falls
        // back to DEFAULTS[field] instead of corrupting the merged config.
        if (typeof value === typeof DEFAULTS[field]) {
          (next[field] as unknown) = value;
        }
      }
      setConfig(next);
    } catch (err) {
      console.warn('[AppConfig] Failed to load config from DB:', err);
    }
  };

  useEffect(() => {
    reloadFromDb();
  }, []);

  // Reload after every delta sync (automatic — reconnect/foreground/periodic
  // — or manual) so screens reading this context never show a stale value
  // just because they weren't the ones that triggered the sync.
  useEffect(() => {
    return onDeltaSyncComplete(() => {
      reloadFromDb();
    });
  }, []);

  // Same, for the first-ever sync (bootstrap) — delta sync never runs until
  // a cursor exists, so this is the only completion signal before that.
  useEffect(() => {
    return onBootstrapCompleted(() => {
      reloadFromDb();
    });
  }, []);

  const value = useMemo<AppConfigContextValue>(() => ({ config, reloadFromDb }), [config]);

  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig(): AppConfigContextValue {
  const ctx = useContext(AppConfigContext);
  if (!ctx) throw new Error('useAppConfig must be used within an AppConfigProvider');
  return ctx;
}
