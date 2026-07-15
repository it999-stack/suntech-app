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
      DROP TABLE IF EXISTS pile_actual_steps;
      DROP TABLE IF EXISTS pile_plan_steps;
      DROP TABLE IF EXISTS piling_checklist_piles;
      DROP TABLE IF EXISTS piling_checklist_personnel;
      DROP TABLE IF EXISTS piling_daily_checklists;
      DROP TABLE IF EXISTS piling_step_duration_templates;
      DROP TABLE IF EXISTS piling_steps;
      DROP TABLE IF EXISTS piling_personnel;
      DROP TABLE IF EXISTS piling_machines;
      DROP TABLE IF EXISTS piling_non_working_windows;
      DROP TABLE IF EXISTS piling_shift_types;
      DROP TABLE IF EXISTS piling_dimensions;
      DROP TABLE IF EXISTS piling_piles;
      DROP TABLE IF EXISTS pile_work_progress;
      DROP TABLE IF EXISTS piling_areas;
    `);
  }

  // ── Core sync tables ──────────────────────────────────────────────────────

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS piling_areas (
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
      ON piling_areas (site_id, sort_order, name);
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pile_work_progress (
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
    CREATE TABLE IF NOT EXISTS piling_piles (
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
    CREATE TABLE IF NOT EXISTS piling_dimensions (
      id           TEXT PRIMARY KEY NOT NULL,
      site_id      TEXT NOT NULL,
      dia          INTEGER NOT NULL,
      depth        INTEGER NOT NULL,
      label        TEXT,
      synced_at    INTEGER NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS piling_shift_types (
      id         TEXT PRIMARY KEY NOT NULL,
      site_id    TEXT NOT NULL,
      name       TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time   TEXT NOT NULL,
      synced_at  INTEGER NOT NULL
    );
  `);

    await sqlite.execAsync(`
      CREATE TABLE IF NOT EXISTS piling_non_working_windows (
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
    CREATE TABLE IF NOT EXISTS piling_machines (
      id          TEXT PRIMARY KEY NOT NULL,
      site_id     TEXT NOT NULL,
      machine_no  TEXT NOT NULL,
      type        TEXT NOT NULL,
      status      TEXT NOT NULL,
      synced_at   INTEGER NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS piling_personnel (
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
    CREATE TABLE IF NOT EXISTS piling_steps (
      id             TEXT PRIMARY KEY NOT NULL,
      step_name      TEXT NOT NULL UNIQUE,
      sequence_order INTEGER NOT NULL,
      track          TEXT NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS piling_step_duration_templates (
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
    CREATE TABLE IF NOT EXISTS piling_daily_checklists (
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
      ON piling_daily_checklists (site_id, date);
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS piling_checklist_personnel (
      id           TEXT PRIMARY KEY NOT NULL,
      checklist_id TEXT NOT NULL,
      personnel_id TEXT NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_personnel_unique
      ON piling_checklist_personnel (checklist_id, personnel_id);
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS piling_checklist_piles (
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
      ON piling_checklist_piles (checklist_id, pile_id);
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pile_plan_steps (
      id                   TEXT PRIMARY KEY NOT NULL,
      checklist_pile_id    TEXT NOT NULL,
      step_id              TEXT NOT NULL,
      planned_start        TEXT NOT NULL,
      planned_end          TEXT NOT NULL,
      duration_minutes     INTEGER,
      buffer_minutes       INTEGER,
      assigned_machine_id  TEXT,
      created_at           INTEGER NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_steps_unique
      ON pile_plan_steps (checklist_pile_id, step_id);
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pile_actual_steps (
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

  await sqlite.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_actual_steps_unique
      ON pile_actual_steps (checklist_pile_id, step_id);
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
