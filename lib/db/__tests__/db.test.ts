import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import type { DatabaseSync } from 'node:sqlite';
import { getDbStatus, isSqliteSupported, openDatabaseAt, withTransaction } from '@/lib/db';
import { MIGRATIONS, getAppliedMigrations, getMigrationVersion, runMigrations } from '@/lib/db/migrations';

describe('database initialization', () => {
   let dir: string;
   let db: DatabaseSync | null = null;

   beforeEach(() => {
      dir = mkdtempSync(path.join(tmpdir(), 'tsdb-'));
   });

   afterEach(() => {
      try {
         db?.close();
      } catch {
         // Already closed.
      }
      db = null;
      delete process.env.TASK_STUDIO_DB_PATH;
      rmSync(dir, { recursive: true, force: true });
   });

   it('is supported on this Node runtime', () => {
      expect(isSqliteSupported()).toBe(true);
   });

   it('creates the file, parent directory and schema on open', () => {
      const dbPath = path.join(dir, 'nested', 'app.sqlite');
      db = openDatabaseAt(dbPath);
      expect(existsSync(dbPath)).toBe(true);

      const tables = db
         .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
         .all() as unknown as Array<{ name: string }>;
      const names = tables.map((t) => t.name);
      for (const expected of [
         'app_settings',
         'projects',
         'runner_runs',
         'runner_locks',
         'runner_log_index',
         'task_cache',
         'webhooks',
         'webhook_deliveries',
         'notifications',
         'integrations',
         'audit_events',
         'schema_migrations',
      ]) {
         expect(names).toContain(expected);
      }
   });

   it('enables WAL journal mode and foreign keys', () => {
      db = openDatabaseAt(path.join(dir, 'app.sqlite'));
      const journal = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
      expect(journal.journal_mode).toBe('wal');
      const fk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
      expect(fk.foreign_keys).toBe(1);
   });

   it('runs each migration exactly once', () => {
      db = openDatabaseAt(path.join(dir, 'app.sqlite'));
      const applied = getAppliedMigrations(db);
      expect(applied.map((m) => m.id)).toEqual(MIGRATIONS.map((m) => m.id));
      expect(getMigrationVersion(db)).toBe(MIGRATIONS[MIGRATIONS.length - 1].id);

      // A second run is a no-op.
      expect(runMigrations(db)).toEqual([]);
      expect(getAppliedMigrations(db).length).toBe(MIGRATIONS.length);
   });

   it('rolls back a failed migration without recording it', () => {
      db = openDatabaseAt(path.join(dir, 'app.sqlite'));
      MIGRATIONS.push({
         id: 9999,
         name: 'intentionally-broken',
         up: (d) => {
            d.exec('CREATE TABLE half_done (id TEXT PRIMARY KEY)');
            throw new Error('boom');
         },
      });
      try {
         expect(() => runMigrations(db!)).toThrow(/intentionally-broken/);
         const tables = db!
            .prepare(`SELECT name FROM sqlite_master WHERE name = 'half_done'`)
            .all();
         expect(tables.length).toBe(0);
         expect(getAppliedMigrations(db!).some((m) => m.id === 9999)).toBe(false);
      } finally {
         MIGRATIONS.pop();
      }
   });

   it('withTransaction rolls back on error', () => {
      db = openDatabaseAt(path.join(dir, 'app.sqlite'));
      expect(() =>
         withTransaction(db!, () => {
            db!
               .prepare(
                  `INSERT INTO notifications (id, type, title, status, created_at)
                   VALUES ('n1', 'test', 'T', 'unread', '2026-01-01T00:00:00Z')`
               )
               .run();
            throw new Error('abort');
         })
      ).toThrow('abort');
      const row = db.prepare('SELECT COUNT(*) AS n FROM notifications').get() as { n: number };
      expect(row.n).toBe(0);
   });

   it('getDbStatus reports path, existence and counts', () => {
      const dbPath = path.join(dir, 'status.sqlite');
      process.env.TASK_STUDIO_DB_PATH = dbPath;
      const status = getDbStatus();
      expect(status.path).toBe(dbPath);
      expect(status.available).toBe(true);
      expect(status.exists).toBe(true);
      expect(status.migrationVersion).toBeGreaterThanOrEqual(1);
      expect(status.runCount).toBe(0);
      expect(status.activeLockCount).toBe(0);
   });
});
