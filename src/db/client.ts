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
const DEV_RESET_DB = false;
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Opens (or creates) the local SQLite database and runs the schema
 * migration inline. Safe to call multiple times — idempotent.
 */
export async function initDb() {
  if (_db) return _db;

  const sqlite = await SQLite.openDatabaseAsync('suntech_local.db');

  // WAL lets readers proceed without blocking on an in-progress writer, and
  // busy_timeout makes a genuine writer-vs-writer collision wait/retry for
  // up to 5s instead of throwing SQLITE_BUSY ("database is locked")
  // immediately — the default busy_timeout is 0. Both apply to every future
  // connection to this file, not just this session, but are cheap no-ops to
  // re-set on an already-WAL database.
  await sqlite.execAsync('PRAGMA journal_mode = WAL;');
  await sqlite.execAsync('PRAGMA busy_timeout = 5000;');

  // ── DEV: nuke all tables so every cold start is a clean slate ─────────────
  if (DEV_RESET_DB) {
    await sqlite.execAsync(`
      DROP TABLE IF EXISTS app_config;
      DROP TABLE IF EXISTS pil_sync_cursor;
      DROP TABLE IF EXISTS pil_sync_queue;
      DROP TABLE IF EXISTS pil_machine_events;
      DROP TABLE IF EXISTS pil_actual_steps;
      DROP TABLE IF EXISTS pil_plan_steps;
      DROP TABLE IF EXISTS pil_checklist_piles;
      DROP TABLE IF EXISTS pil_checklist_personnel;
      DROP TABLE IF EXISTS pil_role_defaults;
      DROP TABLE IF EXISTS pil_daily_checklists;
      DROP TABLE IF EXISTS pil_step_duration_templates;
      DROP TABLE IF EXISTS pil_steps;
      DROP TABLE IF EXISTS pil_site_coordinators;
      DROP TABLE IF EXISTS pil_site_personnel;
      DROP TABLE IF EXISTS pil_machines;
      DROP TABLE IF EXISTS pil_non_working_windows;
      DROP TABLE IF EXISTS pil_shift_types;
      DROP TABLE IF EXISTS pil_dimensions;
      DROP TABLE IF EXISTS pil_piles;
      DROP TABLE IF EXISTS pil_work_progress;
      DROP TABLE IF EXISTS pil_locations;
    `);
  }

  // ── Core sync tables ──────────────────────────────────────────────────────

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_locations (
      id          TEXT PRIMARY KEY NOT NULL,
      site_id     TEXT NOT NULL,
      name        TEXT NOT NULL,
      code        TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      deleted_at  INTEGER
    );
  `);

  await sqlite.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_locations_site_sort
      ON pil_locations (site_id, sort_order, name);
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
      location_id  TEXT,
      pile_id_code TEXT NOT NULL,
      area         TEXT,
      notes        TEXT,
      synced_at    INTEGER NOT NULL,
      updated_at   INTEGER,
      deleted_at   INTEGER
    );
  `);

  await sqlite.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_pil_piles_site_code
      ON pil_piles (site_id, pile_id_code);
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_dimensions (
      id           TEXT PRIMARY KEY NOT NULL,
      site_id      TEXT NOT NULL,
      dia          INTEGER NOT NULL,
      depth        INTEGER NOT NULL,
      label        TEXT,
      synced_at    INTEGER NOT NULL,
      updated_at   INTEGER,
      deleted_at   INTEGER
    );
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_shift_types (
      id         TEXT PRIMARY KEY NOT NULL,
      site_id    TEXT NOT NULL,
      name       TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time   TEXT NOT NULL,
      synced_at  INTEGER NOT NULL,
      updated_at INTEGER,
      deleted_at INTEGER
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
      synced_at     INTEGER NOT NULL,
      updated_at    INTEGER,
      deleted_at    INTEGER
    );
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_machines (
      id          TEXT PRIMARY KEY NOT NULL,
      site_id     TEXT NOT NULL,
      machine_no  TEXT NOT NULL,
      type        TEXT NOT NULL,
      status      TEXT NOT NULL,
      synced_at   INTEGER NOT NULL,
      updated_at  INTEGER,
      deleted_at  INTEGER
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
      synced_at     INTEGER NOT NULL,
      updated_at    INTEGER,
      deleted_at    INTEGER
    );
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_site_coordinators (
      id         TEXT PRIMARY KEY NOT NULL,
      site_id    TEXT NOT NULL,
      name       TEXT NOT NULL,
      phone      TEXT,
      email      TEXT,
      synced_at  INTEGER NOT NULL
    );
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_steps (
      id             TEXT PRIMARY KEY NOT NULL,
      step_name      TEXT NOT NULL,
      sequence_order INTEGER NOT NULL,
      track          TEXT NOT NULL,
      is_splittable  INTEGER NOT NULL DEFAULT 1,
      updated_at     INTEGER
    );
  `);

  await sqlite.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pil_steps_sequence_order
      ON pil_steps (sequence_order);
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_step_duration_templates (
      id                    TEXT PRIMARY KEY NOT NULL,
      step_id               TEXT NOT NULL,
      dimension_id          TEXT NOT NULL,
      duration_minutes      INTEGER NOT NULL,
      buffer_before_minutes INTEGER NOT NULL DEFAULT 0,
      synced_at             INTEGER NOT NULL,
      updated_at            INTEGER
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
      notes           TEXT,
      status          TEXT NOT NULL DEFAULT 'DRAFT',
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL,
      deleted_at      INTEGER
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
      personnel_id TEXT NOT NULL,
      role         TEXT,
      machine_id   TEXT,
      shift_slot   INTEGER,
      updated_at   INTEGER
    );
  `);

  // A person can legitimately have multiple rows on one checklist (e.g. an
  // ENGINEER row per machine in their group), so uniqueness is enforced per
  // role-shape rather than a single (checklist_id, personnel_id) pair —
  // mirrors the server's three role-shaped partial unique indexes.
  await sqlite.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_personnel_singleton
      ON pil_checklist_personnel (checklist_id, role)
      WHERE role IN ('PROJECT_MANAGER','PLANNING_ENGINEER');
  `);
  await sqlite.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_personnel_shift
      ON pil_checklist_personnel (checklist_id, role, shift_slot)
      WHERE role = 'SHIFT_INCHARGE';
  `);
  await sqlite.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_personnel_machine
      ON pil_checklist_personnel (checklist_id, role, machine_id, shift_slot)
      WHERE machine_id IS NOT NULL;
  `);

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_role_defaults (
      id            TEXT PRIMARY KEY NOT NULL,
      site_id       TEXT NOT NULL,
      role          TEXT NOT NULL,
      machine_id    TEXT,
      shift_slot    INTEGER,
      personnel_id  TEXT NOT NULL,
      synced_at     INTEGER NOT NULL,
      updated_at    INTEGER
    );
  `);
  await sqlite.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_role_defaults_singleton
      ON pil_role_defaults (site_id, role)
      WHERE role IN ('PROJECT_MANAGER','PLANNING_ENGINEER');
  `);
  await sqlite.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_role_defaults_shift
      ON pil_role_defaults (site_id, role, shift_slot)
      WHERE role = 'SHIFT_INCHARGE';
  `);
  // Same shift_slot-joins-the-key change as idx_checklist_personnel_machine above.
  await sqlite.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_role_defaults_machine
      ON pil_role_defaults (site_id, role, machine_id, shift_slot)
      WHERE machine_id IS NOT NULL;
  `);

  // Migration: relax crane_id to nullable (a pile can now be planned with a
  // rig alone). SQLite can't ALTER a column's NOT NULL in place, so an
  // already-installed DB whose table still has the old constraint gets
  // rebuilt here before the CREATE TABLE IF NOT EXISTS below (a no-op once
  // this has run, or on any DB that never had the old constraint).
  const craneIdColumn = await sqlite.getFirstAsync<{ notnull: number }>(
    `SELECT "notnull" FROM pragma_table_info('pil_checklist_piles') WHERE name = 'crane_id';`,
  );
  if (craneIdColumn?.notnull === 1) {
    await sqlite.execAsync(`
      ALTER TABLE pil_checklist_piles RENAME TO pil_checklist_piles_pre_optional_crane;
      CREATE TABLE pil_checklist_piles (
        id           TEXT PRIMARY KEY NOT NULL,
        checklist_id TEXT NOT NULL,
        pile_id      TEXT NOT NULL,
        seq_no       INTEGER NOT NULL,
        rig_id       TEXT NOT NULL,
        crane_id     TEXT,
        status       TEXT NOT NULL DEFAULT 'NOT_STARTED',
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER,
        server_updated_at TEXT,
        deleted_at   INTEGER
      );
      INSERT INTO pil_checklist_piles SELECT * FROM pil_checklist_piles_pre_optional_crane;
      DROP TABLE pil_checklist_piles_pre_optional_crane;
    `);
  }

  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_checklist_piles (
      id           TEXT PRIMARY KEY NOT NULL,
      checklist_id TEXT NOT NULL,
      pile_id      TEXT NOT NULL,
      seq_no       INTEGER NOT NULL,
      rig_id       TEXT NOT NULL,
      crane_id     TEXT,
      status       TEXT NOT NULL DEFAULT 'NOT_STARTED',
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER,
      server_updated_at TEXT,
      deleted_at   INTEGER
    );
  `);

  await sqlite.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_piles_unique
      ON pil_checklist_piles (checklist_id, pile_id);
  `);

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
      created_at           INTEGER NOT NULL,
      updated_at           INTEGER
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
      updated_at         INTEGER NOT NULL,
      server_updated_at  TEXT
    );
  `);

  await sqlite.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_actual_steps_unique
      ON pil_actual_steps (checklist_pile_id, step_id);
  `);

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
      created_at     INTEGER NOT NULL,
      updated_at     INTEGER
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

  // Phase 3 delta-sync cursor
  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS pil_sync_cursor (
      site_id      TEXT PRIMARY KEY NOT NULL,
      cursor_value TEXT,
      updated_at   INTEGER
    );
  `);

  // Server-managed constants (see modules/shared/app_config/constants.py) —
  // not piling-specific, hence no pil_ prefix.
  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS app_config (
      key        TEXT PRIMARY KEY NOT NULL,
      value      TEXT NOT NULL,
      synced_at  INTEGER NOT NULL
    );
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
