import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabaseAt } from '@/lib/db';
import {
   acquireLock,
   deleteRuns,
   getLock,
   getLogIndex,
   getRun,
   insertRunIfMissing,
   listRecentRuns,
   markRunInterrupted,
   pruneRuns,
   releaseLock,
   upsertLogIndex,
   upsertRun,
} from '@/lib/db/repositories/runner-runs-repository';
import type { RunRecord } from '@/types/runner';

function makeRun(id: string, startedAt: string, overrides: Partial<RunRecord> = {}): RunRecord {
   return {
      runId: id,
      mode: 'run-task',
      taskId: '12',
      command: ['tm', 'start', '12'],
      status: 'running',
      startedAt,
      finishedAt: null,
      exitCode: null,
      error: null,
      logFile: `.taskmaster/runs/${id}.log`,
      pid: 4242,
      ...overrides,
   };
}

describe('runner runs repository', () => {
   let dir: string;
   let db: DatabaseSync;
   const root = '/tmp/fake-project';

   beforeEach(() => {
      dir = mkdtempSync(path.join(tmpdir(), 'tsdb-runs-'));
      db = openDatabaseAt(path.join(dir, 'app.sqlite'));
   });

   afterEach(() => {
      try {
         db.close();
      } catch {
         // Already closed.
      }
      rmSync(dir, { recursive: true, force: true });
   });

   it('inserts and updates a run through its lifecycle', () => {
      const run = makeRun('run-1', '2026-01-01T10:00:00Z');
      upsertRun(db, root, run);

      let stored = getRun(db, 'run-1');
      expect(stored?.status).toBe('running');
      expect(stored?.command).toEqual(['tm', 'start', '12']);
      expect(stored?.pid).toBe(4242);

      upsertRun(db, root, {
         ...run,
         status: 'completed',
         finishedAt: '2026-01-01T10:05:00Z',
         exitCode: 0,
      });
      stored = getRun(db, 'run-1');
      expect(stored?.status).toBe('completed');
      expect(stored?.exitCode).toBe(0);
      expect(stored?.finishedAt).toBe('2026-01-01T10:05:00Z');
   });

   it('stores commands as structured arrays, never shell strings', () => {
      upsertRun(db, root, makeRun('run-cmd', '2026-01-01T10:00:00Z'));
      const raw = db.prepare('SELECT command_json FROM runner_runs WHERE id = ?').get('run-cmd') as {
         command_json: string;
      };
      expect(JSON.parse(raw.command_json)).toEqual(['tm', 'start', '12']);
   });

   it('lists recent runs newest first with a limit', () => {
      upsertRun(db, root, makeRun('run-a', '2026-01-01T10:00:00Z'));
      upsertRun(db, root, makeRun('run-b', '2026-01-02T10:00:00Z'));
      upsertRun(db, root, makeRun('run-c', '2026-01-03T10:00:00Z'));
      upsertRun(db, '/tmp/other-project', makeRun('run-other', '2026-01-04T10:00:00Z'));

      const runs = listRecentRuns(db, root, 2);
      expect(runs.map((r) => r.runId)).toEqual(['run-c', 'run-b']);
   });

   it('insertRunIfMissing never clobbers newer state (backfill safety)', () => {
      const finished = makeRun('run-x', '2026-01-01T10:00:00Z', {
         status: 'completed',
         exitCode: 0,
      });
      upsertRun(db, root, finished);

      insertRunIfMissing(db, root, makeRun('run-x', '2026-01-01T10:00:00Z')); // stale 'running'
      expect(getRun(db, 'run-x')?.status).toBe('completed');
   });

   it('marks interrupted runs failed only while queued/running', () => {
      upsertRun(db, root, makeRun('run-i', '2026-01-01T10:00:00Z'));
      markRunInterrupted(db, 'run-i', 'server crashed');
      expect(getRun(db, 'run-i')?.status).toBe('failed');
      expect(getRun(db, 'run-i')?.error).toBe('server crashed');

      upsertRun(db, root, makeRun('run-done', '2026-01-01T11:00:00Z', { status: 'completed' }));
      markRunInterrupted(db, 'run-done', 'should not apply');
      expect(getRun(db, 'run-done')?.status).toBe('completed');
   });

   it('prunes old runs but keeps the active run', () => {
      upsertRun(db, root, makeRun('run-1', '2026-01-01T10:00:00Z'));
      upsertRun(db, root, makeRun('run-2', '2026-01-02T10:00:00Z'));
      upsertRun(db, root, makeRun('run-3', '2026-01-03T10:00:00Z'));

      pruneRuns(db, root, 1, 'run-1');
      const remaining = listRecentRuns(db, root, 10).map((r) => r.runId);
      expect(remaining).toContain('run-3'); // newest
      expect(remaining).toContain('run-1'); // active - protected
      expect(remaining).not.toContain('run-2');
   });

   it('deleteRuns removes selected rows and cascades the log index', () => {
      upsertRun(db, root, makeRun('run-del', '2026-01-01T10:00:00Z'));
      upsertLogIndex(db, {
         runId: 'run-del',
         logFile: '.taskmaster/runs/run-del.log',
         sizeBytes: 512,
      });
      expect(getLogIndex(db, 'run-del')?.sizeBytes).toBe(512);

      deleteRuns(db, root, ['run-del']);
      expect(getRun(db, 'run-del')).toBeNull();
      expect(getLogIndex(db, 'run-del')).toBeNull();
   });

   it('acquires, reads, overwrites and releases the project lock', () => {
      acquireLock(db, root, { runId: 'run-1', pid: 111 });
      let lock = getLock(db, root);
      expect(lock?.runId).toBe('run-1');
      expect(lock?.pid).toBe(111);

      acquireLock(db, root, { runId: 'run-2', pid: 222 });
      lock = getLock(db, root);
      expect(lock?.runId).toBe('run-2');

      releaseLock(db, root);
      expect(getLock(db, root)).toBeNull();
   });

   it('is injection-safe: hostile strings stay inert data', () => {
      const hostile = `'; DROP TABLE runner_runs; --`;
      upsertRun(db, root, makeRun('run-evil', '2026-01-01T10:00:00Z', { error: hostile }));
      expect(getRun(db, 'run-evil')?.error).toBe(hostile);
      // Table still exists and other queries still work.
      expect(listRecentRuns(db, root, 10).length).toBe(1);
   });
});
