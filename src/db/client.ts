// src/db/client.ts
// Initializes the local SQLite database using expo-sqlite + Drizzle ORM.
// Call initDb() once on app startup before any DB operations.

import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

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
    `);
  }

  // ── Core sync tables ──────────────────────────────────────────────────────

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS piling_piles (
      id           TEXT PRIMARY KEY NOT NULL,
      site_id      TEXT NOT NULL,
      pile_id_code TEXT NOT NULL,
      area_location TEXT,
      dia          INTEGER NOT NULL,
      depth        INTEGER NOT NULL,
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
      name       TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time   TEXT NOT NULL,
      synced_at  INTEGER NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS piling_non_working_windows (
      id            TEXT PRIMARY KEY NOT NULL,
      site_id       TEXT NOT NULL,
      shift_type_id TEXT NOT NULL,
      label         TEXT NOT NULL,
      start_time    TEXT NOT NULL,
      end_time      TEXT NOT NULL,
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
      buffer_before_minutes INTEGER NOT NULL DEFAULT 0
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

  // ── Runtime migrations (for existing installs) ───────────────────────────
  // Skipped when DEV_RESET_DB is true — tables are always freshly created above.
  if (!DEV_RESET_DB) {
    try {
      await sqlite.execAsync(
        `ALTER TABLE piling_daily_checklists ADD COLUMN supervisor_id_2 TEXT;`,
      );
    } catch {
      // Already exists — safe to ignore
    }
    try {
      await sqlite.execAsync(
        `ALTER TABLE pile_plan_steps ADD COLUMN duration_minutes INTEGER;`,
      );
    } catch {
      // Already exists — safe to ignore
    }
    try {
      await sqlite.execAsync(
        `ALTER TABLE pile_plan_steps ADD COLUMN buffer_minutes INTEGER;`,
      );
    } catch {
      // Already exists — safe to ignore
    }
    try {
      await sqlite.execAsync(
        `ALTER TABLE pile_plan_steps ADD COLUMN assigned_machine_id TEXT;`,
      );
    } catch {
      // Already exists — safe to ignore
    }
  }

  // ── Seed default piling steps (INSERT OR IGNORE = idempotent) ───────────
  await sqlite.execAsync(`
    INSERT OR IGNORE INTO piling_steps (id, step_name, sequence_order, track) VALUES
      ('step_casing',             'Casing',                   1, 'RIG'),
      ('step_boring',             'Boring',                   2, 'RIG'),
      ('step_flushing_pipe_down', 'Flushing Pipe Lowering',   3, 'RIG'),
      ('step_1st_air_flushing',   '1st Air Flushing',         4, 'RIG'),
      ('step_flushing_pipe_up',   'Flushing Pipe Removing',   5, 'RIG'),
      ('step_cage_lower',         'Cage Lowering',            6, 'CRANE'),
      ('step_tremie_lower',       'Tremie Lowering',          7, 'CRANE'),
      ('step_2nd_air_flushing',   '2nd Air Flushing',         8, 'CRANE'),
      ('step_concreting',         'Concreting',               9, 'CRANE');
  `);

  await seedDefaultShiftData(sqlite);

  _db = drizzle(sqlite, { schema });
  return _db;
}

async function seedDefaultShiftData(sqlite: SQLite.SQLiteDatabase) {
  const now = Date.now();

  // Default Shift
  await sqlite.execAsync(`
    INSERT OR IGNORE INTO piling_shift_types (
      id,
      name,
      start_time,
      end_time,
      synced_at
    )
    VALUES (
      'shift_day',
      'Day Shift',
      '08:00',
      '20:00',
      ${now}
    );
  `);

  // Non Working Windows
  await sqlite.execAsync(`
    INSERT OR IGNORE INTO piling_non_working_windows (
      id,
      site_id,
      shift_type_id,
      label,
      start_time,
      end_time,
      synced_at
    ) VALUES
      (
        'window_shift_morning',
        'default_site',
        'shift_day',
        'Morning Shift Change',
        '08:00',
        '09:00',
        ${now}
      ),
      (
        'window_lunch',
        'default_site',
        'shift_day',
        'Lunch Break',
        '13:00',
        '14:00',
        ${now}
      ),
      (
        'window_shift_evening',
        'default_site',
        'shift_day',
        'Evening Shift Change',
        '20:00',
        '21:00',
        ${now}
      );
  `);
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
