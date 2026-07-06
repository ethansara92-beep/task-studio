import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { loadTasksFromRoot } from '@/lib/taskmaster/load-tasks';
import { TaskLoadError } from '@/lib/taskmaster/parse-taskmaster-tasks';

describe('loadTasksFromRoot', () => {
   let dir: string;

   function writeTasks(content: unknown): void {
      mkdirSync(path.join(dir, '.taskmaster', 'tasks'), { recursive: true });
      writeFileSync(
         path.join(dir, '.taskmaster', 'tasks', 'tasks.json'),
         typeof content === 'string' ? content : JSON.stringify(content)
      );
   }

   beforeEach(() => {
      dir = mkdtempSync(path.join(tmpdir(), 'ts-load-'));
   });

   afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
   });

   async function expectCode(promise: Promise<unknown>, code: string, httpStatus: number) {
      try {
         await promise;
         expect.unreachable('should have thrown');
      } catch (error) {
         expect(error).toBeInstanceOf(TaskLoadError);
         expect((error as TaskLoadError).code).toBe(code);
         expect((error as TaskLoadError).httpStatus).toBe(httpStatus);
      }
   }

   it('loads a tagged tasks file and reports the source', async () => {
      writeTasks({
         master: {
            tasks: [{ id: 1, title: 'A', subtasks: [{ id: 1, title: 'A.1' }] }],
            metadata: { created: '2025-03-01' },
         },
      });

      const loaded = await loadTasksFromRoot(dir);
      expect(loaded.tags.master.tasks).toHaveLength(1);
      expect(loaded.source.projectRoot).toBe(dir);
      expect(loaded.source.tasksFilePath).toBe(
         path.join(dir, '.taskmaster', 'tasks', 'tasks.json')
      );
      expect(loaded.source.taskCount).toBe(2); // task + subtask
      expect(loaded.source.mtimeMs).toBeGreaterThan(0);
   });

   it('returns TASKS_FILE_NOT_FOUND (404) when the file is missing', async () => {
      await expectCode(loadTasksFromRoot(dir), 'TASKS_FILE_NOT_FOUND', 404);
   });

   it('returns INVALID_JSON (422) for a corrupt file', async () => {
      writeTasks('{ definitely not json');
      await expectCode(loadTasksFromRoot(dir), 'INVALID_JSON', 422);
   });

   it('returns UNSUPPORTED_FORMAT (422) for valid JSON in an unknown shape', async () => {
      writeTasks({ hello: 'world' });
      await expectCode(loadTasksFromRoot(dir), 'UNSUPPORTED_FORMAT', 422);
   });

   it('supports legacy flat and array formats', async () => {
      writeTasks({ tasks: [{ id: 7, title: 'Legacy' }] });
      expect((await loadTasksFromRoot(dir)).tags.master.tasks[0].title).toBe('Legacy');

      writeTasks([{ id: 8, title: 'Array' }]);
      expect((await loadTasksFromRoot(dir)).tags.master.tasks[0].title).toBe('Array');
   });
});
