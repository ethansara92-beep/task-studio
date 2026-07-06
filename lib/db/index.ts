import { existsSync, mkdirSync, statSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { getTaskmasterPath } from '@/lib/taskmaster-paths';
import { getMigrationVersion, runMigrations } from './migrations';

/**
 * Task Studio app database (SQLite via the Node.js built-in `node:sqlite`).
 *
 * Why `node:sqlite`: this package ships a prebuilt Next.js standalone server
 * to npm, so a native addon (better-sqlite3 et al.) would pin the published
 * artifact to one platform. The built-in module needs no dependency, no
 * compilation, and has the same synchronous API shape. It requires
 * Node.js >= 22.5; on older runtimes the app degrades gracefully (settings
 * fall back to the legacy JSON file and DB-backed features are disabled).
 *
 * The database lives at `.taskmaster/task-studio.sqlite`, next to the other
 * machine-local Task Studio files (settings, audit log). It is git-ignored.
 * Taskmaster's own files are NEVER stored here - `.taskmaster/tasks/tasks.json`
 * remains the canonical task source.
 */

export const DB_FILE_NAME = 'task-studio.sqlite';

export class DbUnavailableError extends Error {
   constructor(message: string) {
      super(message);
      this.name = 'DbUnavailableError';
   }
}

type SqliteModule = typeof import('node:sqlite');

/** Resolves the built-in sqlite module, or null on Node runtimes without it. */
function loadSqliteModule(): SqliteModule | null {
   try {
      const getBuiltin = (
         process as unknown as { getBuiltinModule?: (id: string) => unknown }
      ).getBuiltinModule;
      if (!getBuiltin) return null;
      return (getBuiltin.call(process, 'node:sqlite') as SqliteModule) ?? null;
   } catch {
      return null;
   }
}

/** True when the current Node.js runtime can provide SQLite. */
export function isSqliteSupported(): boolean {
   return loadSqliteModule() !== null;
}

/** Absolute path of the app database file. */
export function getDbPath(): string {
   if (process.env.TASK_STUDIO_DB_PATH) {
      return path.resolve(process.env.TASK_STUDIO_DB_PATH);
   }
   return path.join(getTaskmasterPath(), DB_FILE_NAME);
}

/**
 * Opens (or creates) a database at an explicit path, applies pragmas and
 * migrations, and returns the handle. Exported for tests; application code
 * should use getDb()/tryGetDb().
 */
export function openDatabaseAt(dbPath: string): DatabaseSync {
   const sqlite = loadSqliteModule();
   if (!sqlite) {
      throw new DbUnavailableError(
         'SQLite is unavailable: Task Studio’s database needs Node.js >= 22.5 ' +
            `(current: ${process.version}). Settings fall back to the JSON file; ` +
            'runner history, projects and task cache require the database.'
      );
   }

   mkdirSync(path.dirname(dbPath), { recursive: true });
   const db = new sqlite.DatabaseSync(dbPath);
   db.exec('PRAGMA journal_mode = WAL');
   db.exec('PRAGMA foreign_keys = ON');
   db.exec('PRAGMA busy_timeout = 5000');
   runMigrations(db);
   return db;
}

interface DbGlobalCache {
   __taskStudioDb?: { path: string; db: DatabaseSync };
   __taskStudioDbError?: string;
}

/**
 * Cached on globalThis so Next.js dev-mode HMR re-evaluation of this module
 * does not open a second connection to the same file.
 */
const globalCache = globalThis as unknown as DbGlobalCache;

/** Seeds the server's configured project root into `projects` (idempotent). */
function seedConfiguredProject(db: DatabaseSync): void {
   try {
      const projectRoot = path.dirname(path.resolve(getTaskmasterPath()));
      const tasksJson = path.join(projectRoot, '.taskmaster', 'tasks', 'tasks.json');
      const isValid = existsSync(tasksJson);
      const now = new Date().toISOString();
      db.prepare(
         `INSERT INTO projects
            (id, name, root_path, is_default, is_valid, validation_status, created_at, updated_at, last_opened_at)
          VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
          ON CONFLICT (root_path) DO UPDATE SET
            is_valid = excluded.is_valid,
            validation_status = excluded.validation_status,
            last_opened_at = excluded.last_opened_at,
            updated_at = excluded.updated_at`
      ).run(
         crypto.randomUUID(),
         path.basename(projectRoot),
         projectRoot,
         isValid ? 1 : 0,
         isValid ? 'valid' : 'missing-tasks-file',
         now,
         now,
         now
      );
   } catch {
      // Seeding is best-effort; the projects API can register roots later.
   }
}

/**
 * The shared app database connection. Throws DbUnavailableError when the
 * runtime has no SQLite support or the file cannot be opened/migrated.
 */
export function getDb(): DatabaseSync {
   const dbPath = getDbPath();
   const cached = globalCache.__taskStudioDb;
   if (cached && cached.path === dbPath && cached.db.isOpen) {
      return cached.db;
   }

   try {
      const db = openDatabaseAt(dbPath);
      seedConfiguredProject(db);
      globalCache.__taskStudioDb = { path: dbPath, db };
      globalCache.__taskStudioDbError = undefined;
      return db;
   } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      globalCache.__taskStudioDbError = message;
      if (error instanceof DbUnavailableError) throw error;
      throw new DbUnavailableError(`Failed to open the Task Studio database: ${message}`);
   }
}

/** Like getDb(), but returns null instead of throwing (for best-effort writes). */
export function tryGetDb(): DatabaseSync | null {
   try {
      return getDb();
   } catch {
      return null;
   }
}

/** Closes the cached connection (tests and backup/restore flows). */
export function closeDb(): void {
   const cached = globalCache.__taskStudioDb;
   if (cached) {
      try {
         cached.db.close();
      } catch {
         // Already closed.
      }
      globalCache.__taskStudioDb = undefined;
   }
}

/** Runs `fn` inside a transaction, rolling back on any thrown error. */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
   db.exec('BEGIN');
   try {
      const result = fn();
      db.exec('COMMIT');
      return result;
   } catch (error) {
      try {
         db.exec('ROLLBACK');
      } catch {
         // Transaction already aborted.
      }
      throw error;
   }
}

export interface DbStatus {
   path: string;
   exists: boolean;
   available: boolean;
   sizeBytes: number | null;
   migrationVersion: number | null;
   projectCount: number | null;
   runCount: number | null;
   activeLockCount: number | null;
   error?: string;
}

/** Diagnostics snapshot for the Developer settings page. Never throws. */
export function getDbStatus(): DbStatus {
   const dbPath = getDbPath();
   const status: DbStatus = {
      path: dbPath,
      exists: existsSync(dbPath),
      available: false,
      sizeBytes: null,
      migrationVersion: null,
      projectCount: null,
      runCount: null,
      activeLockCount: null,
   };

   try {
      status.sizeBytes = status.exists ? statSync(dbPath).size : null;
   } catch {
      // Size is informational only.
   }

   try {
      const db = getDb();
      const count = (table: string): number => {
         // Table names come from this fixed list, never from user input.
         const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
         return row.n;
      };
      status.available = true;
      status.exists = true;
      status.migrationVersion = getMigrationVersion(db);
      status.projectCount = count('projects');
      status.runCount = count('runner_runs');
      status.activeLockCount = count('runner_locks');
   } catch (error) {
      status.error = error instanceof Error ? error.message : String(error);
   }

   return status;
}
