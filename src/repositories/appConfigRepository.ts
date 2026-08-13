// src/repositories/appConfigRepository.ts
// Local SQLite access for cached app_config data (server-managed constants —
// see suntech-core/modules/shared/app_config/constants.py).

import { initDb } from '@db/client';
import { appConfig } from '@db/schema';

/**
 * Replace the local app_config cache with a fresh batch from the server.
 * `value` is JSON.stringify'd before storage so the original type (bool,
 * number, or string) round-trips back out via JSON.parse in getAllAppConfig.
 */
export async function saveAppConfig(entries: { key: string; value: unknown }[]): Promise<void> {
  if (entries.length === 0) return;

  const db = await initDb();
  const syncedAt = Date.now();
  for (const entry of entries) {
    const value = JSON.stringify(entry.value);
    await db
      .insert(appConfig)
      .values({ key: entry.key, value, syncedAt })
      .onConflictDoUpdate({
        target: appConfig.key,
        set: { value, syncedAt },
      });
  }
}

/**
 * Return every cached config value as a plain object keyed by the server's
 * own key names (snake_case, e.g. "piles_page_size"), with each value
 * JSON.parse'd back to its original type.
 */
export async function getAllAppConfig(): Promise<Record<string, unknown>> {
  const db = await initDb();
  const rows = await db.select().from(appConfig);
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      // A malformed row shouldn't take down the whole config read — the
      // caller (AppConfigContext) falls back to its own default for any
      // key missing from this object.
    }
  }
  return result;
}
