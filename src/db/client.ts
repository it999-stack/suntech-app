// src/db/client.ts
// Initializes the local SQLite database using expo-sqlite + Drizzle ORM.
// Call initDb() once on app startup before any DB operations.

import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

// Synchronous db export for useLiveQuery - must be initialized before use
export let db: ReturnType<typeof drizzle>;

let _db: ReturnType<typeof drizzle> | null = null;

// ─── DEV RESET FLAG ───────────────────────────────────────────────────────────
// Set to true to drop and recreate all tables on every cold start.
// Flip to false (or delete this block) before shipping to production.
const DEV_RESET_DB = false;
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Opens (or creates) the local SQLite database and runs the schema
 * migration inline. Safe to call multiple times — idempotent.
 */
export async function initDb() {
  if (_db) return _db;

  const sqlite = await SQLite.openDatabaseAsync('suntech_local.db');

  // ── DEV: nuke all tables so every cold start is a clean slate ─────────────
  if (DEV_RESET_DB) {
    await sqlite.execAsync(`
      DROP TABLE IF EXISTS pil_sync_queue;
      DROP TABLE IF EXISTS pil_machine_events;
      DROP TABLE IF EXISTS pil_actual_steps;
      DROP TABLE IF EXISTS pil_plan_steps;
      DROP TABLE IF EXISTS pil_checklist_piles;
      DROP TABLE IF EXISTS pil_checklist_personnel;
      DROP TABLE IF EXISTS pil_daily_checklists;
      DROP TABLE IF EXISTS pil_step_duration_templates;
      DROP TABLE IF EXISTS pil_steps;
      DROP TABLE IF EXISTS pil_site_personnel;
      DROP TABLE IF EXISTS pil_machines;
      DROP TABLE IF EXISTS pil_non_working_windows;
      DROP TABLE IF EXISTS pil_shift_types;
      DROP TABLE IF EXISTS pil_dimensions;
      DROP TABLE IF EXISTS pil_piles;
      DROP TABLE IF EXISTS pil_work_progress;
      DROP TABLE IF EXISTS pil_areas;
    `);
  }

  // ── Core sync tables ──────────────────────────────────────────────────────

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_areas (
      id          TEXT PRIMARY KEY NOT NULL,
      site_id     TEXT NOT NULL,
      name        TEXT NOT NULL,
      code        TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_areas_site_sort
      ON pil_areas (site_id, sort_order, name);
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_work_progress (
      id                     TEXT PRIMARY KEY NOT NULL,
      pile_id                TEXT NOT NULL UNIQUE,
      step_id                TEXT NOT NULL,
      remaining_minutes      INTEGER NOT NULL,
      status                 TEXT NOT NULL DEFAULT 'PENDING_RESUME',
      last_checklist_pile_id TEXT,
      last_rig_id            TEXT,
      last_crane_id          TEXT,
      created_at             INTEGER NOT NULL,
      updated_at             INTEGER NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_piles (
      id           TEXT PRIMARY KEY NOT NULL,
      site_id      TEXT NOT NULL,
      dimension_id TEXT NOT NULL,
      area_id      TEXT,
      pile_id_code TEXT NOT NULL,
      area_location TEXT,
      notes        TEXT,
      synced_at    INTEGER NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_dimensions (
      id           TEXT PRIMARY KEY NOT NULL,
      site_id      TEXT NOT NULL,
      dia          INTEGER NOT NULL,
      depth        INTEGER NOT NULL,
      label        TEXT,
      synced_at    INTEGER NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_shift_types (
      id         TEXT PRIMARY KEY NOT NULL,
      site_id    TEXT NOT NULL,
      name       TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time   TEXT NOT NULL,
      synced_at  INTEGER NOT NULL
    );
  `);

    await sqlite.execAsync(`
      CREATE TABLE IF NOT EXISTS pil_non_working_windows (
        id            TEXT PRIMARY KEY NOT NULL,
        shift_type_id TEXT NOT NULL,
        label         TEXT NOT NULL,
        start_time    TEXT NOT NULL,
        end_time      TEXT NOT NULL,
        behavior      TEXT NOT NULL DEFAULT 'FIXED',
        synced_at     INTEGER NOT NULL
      );
    `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_machines (
      id          TEXT PRIMARY KEY NOT NULL,
      site_id     TEXT NOT NULL,
      machine_no  TEXT NOT NULL,
      type        TEXT NOT NULL,
      status      TEXT NOT NULL,
      synced_at   INTEGER NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_site_personnel (
      id            TEXT PRIMARY KEY NOT NULL,
      site_id       TEXT NOT NULL,
      name          TEXT NOT NULL,
      designation   TEXT NOT NULL,
      phone         TEXT,
      email         TEXT,
      employee_code TEXT,
      is_active     INTEGER NOT NULL DEFAULT 1,
      synced_at     INTEGER NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_steps (
      id             TEXT PRIMARY KEY NOT NULL,
      step_name      TEXT NOT NULL,
      sequence_order INTEGER NOT NULL,
      track          TEXT NOT NULL
    );
  `);

  // Guarded: an existing install synced before sequence_order became unique on the
  // server could locally have duplicate values, which would make this throw and
  // crash every cold start. Dedupe and retry rather than leave the app unbootable —
  // pil_steps is replaced wholesale on the next successful sync anyway.
  try {
    await sqlite.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pil_steps_sequence_order
        ON pil_steps (sequence_order);
    `);
  } catch {
    await sqlite.execAsync(`
      DELETE FROM pil_steps
      WHERE rowid NOT IN (SELECT MIN(rowid) FROM pil_steps GROUP BY sequence_order);
    `);
    await sqlite.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pil_steps_sequence_order
        ON pil_steps (sequence_order);
    `);
  }

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_step_duration_templates (
      id                    TEXT PRIMARY KEY NOT NULL,
      step_id               TEXT NOT NULL,
      dimension_id          TEXT NOT NULL,
      duration_minutes      INTEGER NOT NULL,
      buffer_before_minutes INTEGER NOT NULL DEFAULT 0,
      synced_at             INTEGER NOT NULL
    );
  `);

  // ── Plan / Checklist tables ───────────────────────────────────────────────

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_daily_checklists (
      id              TEXT PRIMARY KEY NOT NULL,
      site_id         TEXT NOT NULL,
      date            TEXT NOT NULL,
      shift_type_id   TEXT,
      plan_start_time TEXT,
      plan_end_time   TEXT,
      supervisor_id   TEXT,
      supervisor_id_2 TEXT,
      notes           TEXT,
      status          TEXT NOT NULL DEFAULT 'DRAFT',
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_checklists_site_date
      ON pil_daily_checklists (site_id, date);
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_checklist_personnel (
      id           TEXT PRIMARY KEY NOT NULL,
      checklist_id TEXT NOT NULL,
      personnel_id TEXT NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_personnel_unique
      ON pil_checklist_personnel (checklist_id, personnel_id);
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_checklist_piles (
      id           TEXT PRIMARY KEY NOT NULL,
      checklist_id TEXT NOT NULL,
      pile_id      TEXT NOT NULL,
      seq_no       INTEGER NOT NULL,
      rig_id       TEXT NOT NULL,
      crane_id     TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'NOT_STARTED',
      created_at   INTEGER NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_piles_unique
      ON pil_checklist_piles (checklist_id, pile_id);
  `);

  // Guarded: devices that already have pil_plan_steps on disk have
  // `planned_end TEXT NOT NULL` baked in from before continuing steps existed.
  // SQLite has no ALTER COLUMN DROP NOT NULL, so rebuild-and-copy into a
  // nullable table. A migration hiccup here must not brick cold start.
  try {
    const columns = await sqlite.getAllAsync<{ name: string; notnull: number }>(
      `PRAGMA table_info('pil_plan_steps');`
    );
    const plannedEndCol = columns.find((c) => c.name === 'planned_end');
    if (plannedEndCol && plannedEndCol.notnull === 1) {
      await sqlite.execAsync(`
        CREATE TABLE pil_plan_steps_new (
          id                   TEXT PRIMARY KEY NOT NULL,
          checklist_pile_id    TEXT NOT NULL,
          step_id              TEXT NOT NULL,
          planned_start        TEXT NOT NULL,
          planned_end          TEXT,
          duration_minutes     INTEGER,
          buffer_minutes       INTEGER,
          assigned_machine_id  TEXT,
          created_at           INTEGER NOT NULL
        );
        INSERT INTO pil_plan_steps_new SELECT * FROM pil_plan_steps;
        DROP TABLE pil_plan_steps;
        ALTER TABLE pil_plan_steps_new RENAME TO pil_plan_steps;
      `);
    }
  } catch {
    // Leave the existing table as-is; the CREATE TABLE IF NOT EXISTS below
    // is a no-op in that case, and worst case plannedEnd stays NOT NULL on
    // this device until a future successful migration.
  }

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_plan_steps (
      id                   TEXT PRIMARY KEY NOT NULL,
      checklist_pile_id    TEXT NOT NULL,
      step_id              TEXT NOT NULL,
      planned_start        TEXT NOT NULL,
      planned_end          TEXT,
      duration_minutes     INTEGER,
      buffer_minutes       INTEGER,
      assigned_machine_id  TEXT,
      created_at           INTEGER NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_steps_unique
      ON pil_plan_steps (checklist_pile_id, step_id);
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_actual_steps (
      id                 TEXT PRIMARY KEY NOT NULL,
      checklist_pile_id  TEXT NOT NULL,
      step_id            TEXT NOT NULL,
      actual_start       TEXT,
      actual_end         TEXT,
      remarks            TEXT,
      created_at         INTEGER NOT NULL,
      updated_at         INTEGER NOT NULL
    );
  `);

  // Guarded: a device carrying pre-existing duplicate (checklist_pile_id,
  // step_id) rows from before this index existed would otherwise throw here
  // and never get the index created, leaving every later upsertActualStep()
  // failing with "ON CONFLICT clause does not match ..." forever. Dedupe
  // (keep one row per pair) and retry, matching the pil_steps pattern above.
  try {
    await sqlite.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_actual_steps_unique
        ON pil_actual_steps (checklist_pile_id, step_id);
    `);
  } catch {
    await sqlite.execAsync(`
      DELETE FROM pil_actual_steps
      WHERE rowid NOT IN (
        SELECT MIN(rowid) FROM pil_actual_steps GROUP BY checklist_pile_id, step_id
      );
    `);
    await sqlite.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_actual_steps_unique
        ON pil_actual_steps (checklist_pile_id, step_id);
    `);
  }

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_machine_events (
      id             TEXT PRIMARY KEY NOT NULL,
      checklist_id   TEXT NOT NULL,
      pile_id        TEXT NOT NULL,
      step_id        TEXT,
      track          TEXT NOT NULL,
      event_type     TEXT NOT NULL,
      machine_id     TEXT,
      replacement_id TEXT,
      notes          TEXT,
      occurred_at    TEXT NOT NULL,
      created_at     INTEGER NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_machine_events_checklist
      ON pil_machine_events (checklist_id);
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_sync_queue (
      id            TEXT PRIMARY KEY NOT NULL,
      checklist_id  TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending',
      attempts      INTEGER NOT NULL DEFAULT 0,
      last_error    TEXT,
      enqueued_at   INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_queue_checklist_unique
      ON pil_sync_queue (checklist_id);
  `);

  _db = drizzle(sqlite, { schema });
  db = _db;
  return _db;
}

/**
 * Returns the already-initialized DB instance.
 * Throws if initDb() hasn't been called yet.
 */
export function getDb() {
  if (!_db) {
    throw new Error('DB not initialized. Call initDb() first (in App.tsx or bootstrap).');
  }
  return _db;
}
