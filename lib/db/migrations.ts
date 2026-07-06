import type { DatabaseSync } from 'node:sqlite';
import { INITIAL_SCHEMA } from './schema';

/**
 * Lightweight, deterministic migration system.
 *
 * Migrations are append-only: never edit or reorder an entry that has
 * shipped - add a new one. Each migration runs exactly once, inside its own
 * transaction, and is recorded in `schema_migrations`.
 */

export interface Migration {
   id: number;
   name: string;
   /** Static SQL only. User data never appears in migration SQL. */
   up: (db: DatabaseSync) => void;
}

export const MIGRATIONS: Migration[] = [
   {
      id: 1,
      name: 'initial-schema',
      up: (db) => {
         db.exec(INITIAL_SCHEMA);
      },
   },
];

export interface AppliedMigration {
   id: number;
   name: string;
   applied_at: string;
}

function ensureMigrationsTable(db: DatabaseSync): void {
   db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
         id INTEGER PRIMARY KEY,
         name TEXT NOT NULL UNIQUE,
         applied_at TEXT NOT NULL
      );
   `);
}

export function getAppliedMigrations(db: DatabaseSync): AppliedMigration[] {
   ensureMigrationsTable(db);
   return db
      .prepare('SELECT id, name, applied_at FROM schema_migrations ORDER BY id')
      .all() as unknown as AppliedMigration[];
}

/** Highest applied migration id, or 0 when none have run. */
export function getMigrationVersion(db: DatabaseSync): number {
   const applied = getAppliedMigrations(db);
   return applied.length > 0 ? applied[applied.length - 1].id : 0;
}

/**
 * Applies all pending migrations. Each migration runs in a transaction so a
 * failure rolls back cleanly instead of leaving a half-applied schema.
 * Returns the names of migrations applied in this call.
 */
export function runMigrations(db: DatabaseSync): string[] {
   ensureMigrationsTable(db);

   const appliedIds = new Set(getAppliedMigrations(db).map((m) => m.id));
   const appliedNow: string[] = [];

   for (const migration of MIGRATIONS) {
      if (appliedIds.has(migration.id)) continue;

      db.exec('BEGIN');
      try {
         migration.up(db);
         db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(
            migration.id,
            migration.name,
            new Date().toISOString()
         );
         db.exec('COMMIT');
         appliedNow.push(migration.name);
      } catch (error) {
         try {
            db.exec('ROLLBACK');
         } catch {
            // Transaction may already be aborted; nothing else to roll back.
         }
         throw new Error(
            `Migration ${migration.id} (${migration.name}) failed: ` +
               (error instanceof Error ? error.message : String(error))
         );
      }
   }

   return appliedNow;
}
