import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabaseAt } from '@/lib/db';
import {
   countCachedTasks,
   getCachedTaskById,
   getCachedTasks,
   refreshTaskCache,
   refreshTaskCacheIfStale,
} from '@/lib/db/repositories/task-cache-repository';

const SAMPLE_TASKS = {
   master: {
      tasks: [
         {
            id: 1,
            title: 'Setup API',
            description: 'Build the API layer',
            status: 'pending',
            priority: 'high',
            dependencies: [],
            labels: ['feature'],
            subtasks: [
               { id: 1, title: 'Design routes', status: 'done', dependencies: [] },
               { id: 2, title: 'Implement handlers', status: 'pending', dependencies: [1] },
            ],
         },
         {
            id: 2,
            title: 'Write docs',
            description: 'Document everything',
            status: 'done',
            priority: 'low',
            dependencies: [1],
         },
      ],
   },
   'feature-x': {
      tasks: [{ id: 1, title: 'Feature X kickoff', status: 'pending', priority: 'medium' }],
   },
};

describe('task cache repository', () => {
   let dir: string;
   let root: string;
   let db: DatabaseSync;

   function writeTasks(content: unknown, mtime?: Date): void {
      const file = path.join(root, '.taskmaster', 'tasks', 'tasks.json');
      writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
      if (mtime) utimesSync(file, mtime, mtime);
   }

   beforeEach(() => {
      dir = mkdtempSync(path.join(tmpdir(), 'tsdb-cache-'));
      root = path.join(dir, 'project');
      mkdirSync(path.join(root, '.taskmaster', 'tasks'), { recursive: true });
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

   it('refreshes from a tagged tasks.json, flattening subtasks with dotted IDs', async () => {
      writeTasks(SAMPLE_TASKS);
      const result = await refreshTaskCache(db, root);

      expect(result.refreshed).toBe(true);
      expect(result.taskCount).toBe(5); // 2 + 2 subtasks + 1 in feature-x
      expect(countCachedTasks(db, root)).toBe(5);

      const subtask = getCachedTaskById(db, root, 'master', '1.2');
      expect(subtask?.title).toBe('Implement handlers');
      expect(subtask?.status).toBe('pending');

      const tagged = getCachedTasks(db, root, { tag: 'feature-x' });
      expect(tagged.length).toBe(1);
      expect(tagged[0].taskId).toBe('1');
   });

   it('supports the legacy flat { tasks: [...] } format', async () => {
      writeTasks({ tasks: [{ id: 7, title: 'Legacy', status: 'pending' }] });
      const result = await refreshTaskCache(db, root);
      expect(result.taskCount).toBe(1);
      expect(getCachedTaskById(db, root, 'master', '7')?.title).toBe('Legacy');
   });

   it('filters by status, priority and label; searches by title', async () => {
      writeTasks(SAMPLE_TASKS);
      await refreshTaskCache(db, root);

      expect(getCachedTasks(db, root, { status: 'done' }).map((t) => t.taskId)).toEqual(
         expect.arrayContaining(['2', '1.1'])
      );
      expect(getCachedTasks(db, root, { priority: 'high' }).length).toBe(1);
      expect(getCachedTasks(db, root, { label: 'feature' }).length).toBe(1);
      expect(getCachedTasks(db, root, { search: 'docs' })[0].taskId).toBe('2');
   });

   it('treats hostile search input as inert data (parameterized LIKE)', async () => {
      writeTasks(SAMPLE_TASKS);
      await refreshTaskCache(db, root);

      expect(getCachedTasks(db, root, { search: `%' OR '1'='1` }).length).toBe(0);
      expect(getCachedTasks(db, root, { search: `_` }).length).toBe(0); // literal underscore
      expect(countCachedTasks(db, root)).toBe(5); // nothing dropped
   });

   it('the file wins: cache updates on change and drops removed tasks', async () => {
      writeTasks(SAMPLE_TASKS, new Date('2026-01-01T10:00:00Z'));
      await refreshTaskCacheIfStale(db, root);
      expect(countCachedTasks(db, root)).toBe(5);

      // Unchanged mtime: no refresh.
      const noop = await refreshTaskCacheIfStale(db, root);
      expect(noop.refreshed).toBe(false);

      // Changed file: refresh picks up edits and deletions.
      writeTasks(
         { master: { tasks: [{ id: 1, title: 'Setup API v2', status: 'in-progress' }] } },
         new Date('2026-01-02T10:00:00Z')
      );
      const refreshed = await refreshTaskCacheIfStale(db, root);
      expect(refreshed.refreshed).toBe(true);
      expect(countCachedTasks(db, root)).toBe(1);
      expect(getCachedTaskById(db, root, 'master', '1')?.title).toBe('Setup API v2');
      expect(getCachedTaskById(db, root, 'master', '2')).toBeNull();
   });

   it('keeps the previous cache when tasks.json is temporarily invalid JSON', async () => {
      writeTasks(SAMPLE_TASKS);
      await refreshTaskCache(db, root);

      writeTasks('{ not json at all');
      const result = await refreshTaskCache(db, root);
      expect(result.refreshed).toBe(false);
      expect(result.error).toMatch(/not valid JSON/);
      expect(countCachedTasks(db, root)).toBe(5); // previous cache intact
   });

   it('clears the cache when the tasks file is gone', async () => {
      writeTasks(SAMPLE_TASKS);
      await refreshTaskCache(db, root);
      rmSync(path.join(root, '.taskmaster', 'tasks', 'tasks.json'));

      const result = await refreshTaskCache(db, root);
      expect(result.refreshed).toBe(true);
      expect(result.taskCount).toBe(0);
      expect(countCachedTasks(db, root)).toBe(0);
   });

   it('never modifies tasks.json (cache is read-only toward the file)', async () => {
      writeTasks(SAMPLE_TASKS, new Date('2026-01-01T10:00:00Z'));
      const before = JSON.stringify(SAMPLE_TASKS);
      await refreshTaskCache(db, root);
      const after = readFileSync(path.join(root, '.taskmaster', 'tasks', 'tasks.json'), 'utf-8');
      expect(after).toBe(before);
   });
});
