import { promises as fs } from 'fs';
import { tryGetDb } from '@/lib/db';
import { refreshTaskCacheIfStale } from '@/lib/db/repositories/task-cache-repository';
import {
   TagContexts,
   TaskLoadError,
   countTasks,
   extractTagContexts,
} from './parse-taskmaster-tasks';
import { getTasksFilePath, resolveActiveProjectRoot } from './project-root';

/**
 * The single server-side loader for Taskmaster tasks.
 *
 * Reads `<projectRoot>/.taskmaster/tasks/tasks.json` (canonical source of
 * truth), parses/validates it, and - best-effort - refreshes the SQLite
 * task_cache index from it. Every failure is a typed TaskLoadError; there is
 * no fallback to mock or cached data on the read path.
 */

export interface TaskSource {
   projectRoot: string;
   tasksFilePath: string;
   mtimeMs: number | null;
   taskCount: number;
}

export interface LoadedTasks {
   source: TaskSource;
   tags: TagContexts;
}

/**
 * Loads and parses the tasks file for an already-resolved project root.
 * Exported separately from loadTaskmasterTasks for unit testing.
 */
export async function loadTasksFromRoot(projectRoot: string): Promise<LoadedTasks> {
   const tasksFilePath = getTasksFilePath(projectRoot);

   let raw: string;
   let mtimeMs: number | null = null;
   try {
      const stat = await fs.stat(tasksFilePath);
      mtimeMs = Math.floor(stat.mtimeMs);
      raw = await fs.readFile(tasksFilePath, 'utf-8');
   } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'EACCES' || code === 'EPERM') {
         throw new TaskLoadError(
            'PERMISSION_DENIED',
            `Permission denied reading tasks file: ${tasksFilePath}`,
            403
         );
      }
      throw new TaskLoadError(
         'TASKS_FILE_NOT_FOUND',
         `Taskmaster tasks file not found: ${tasksFilePath}. Run "task-master init" in the project or check the project root.`,
         404
      );
   }

   let parsed: unknown;
   try {
      parsed = JSON.parse(raw);
   } catch (error) {
      throw new TaskLoadError(
         'INVALID_JSON',
         `Failed to parse tasks.json: ${error instanceof Error ? error.message : 'invalid JSON'}`,
         422
      );
   }

   const tags = extractTagContexts(parsed); // throws UNSUPPORTED_FORMAT

   return {
      source: {
         projectRoot,
         tasksFilePath,
         mtimeMs,
         taskCount: countTasks(tags),
      },
      tags,
   };
}

/**
 * Resolves the active project root (settings default / allowlisted request /
 * env fallback), loads the tasks file, and keeps the SQLite task_cache in
 * sync with it. The file always wins over the cache.
 */
export async function loadTaskmasterTasks(requestedRoot?: string | null): Promise<LoadedTasks> {
   const projectRoot = await resolveActiveProjectRoot(requestedRoot);
   const loaded = await loadTasksFromRoot(projectRoot);

   // Cache refresh is an index update, never a data source for this response.
   try {
      const db = tryGetDb();
      if (db) await refreshTaskCacheIfStale(db, projectRoot);
   } catch {
      // Cache maintenance must never break task loading.
   }

   return loaded;
}
