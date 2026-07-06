import crypto from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from '@/lib/db';
import {
   TagContexts,
   TaskLoadError,
   extractTagContexts,
} from '@/lib/taskmaster/parse-taskmaster-tasks';
import type { TaskmasterTask } from '@/types/taskmaster';

/**
 * Read-through cache/index of Taskmaster tasks.
 *
 * `.taskmaster/tasks/tasks.json` is ALWAYS canonical. This cache exists for
 * fast queries (search/filter) and future features; it is refreshed from the
 * file and never written back. When cache and file disagree, the file wins:
 * refreshTaskCache() rebuilds the project's rows from the file inside one
 * transaction, which also removes rows for deleted tasks.
 */

export interface CachedTask {
   id: string;
   projectRoot: string;
   tag: string;
   taskId: string;
   title: string | null;
   description: string | null;
   status: string | null;
   priority: string | null;
   dependencies: unknown[];
   labels: string[];
   raw: unknown;
   sourceFile: string;
   sourceMtimeMs: number | null;
   updatedAt: string;
}

interface CacheRow {
   id: string;
   project_root: string;
   tag: string;
   task_id: string;
   title: string | null;
   description: string | null;
   status: string | null;
   priority: string | null;
   dependencies_json: string | null;
   labels_json: string | null;
   raw_json: string;
   source_file: string;
   source_mtime_ms: number | null;
   updated_at: string;
}

function parseArray(raw: string | null): unknown[] {
   if (!raw) return [];
   try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
   } catch {
      return [];
   }
}

function toCachedTask(row: CacheRow): CachedTask {
   let raw: unknown = null;
   try {
      raw = JSON.parse(row.raw_json);
   } catch {
      // Corrupt row payload; expose the scalar columns anyway.
   }
   return {
      id: row.id,
      projectRoot: row.project_root,
      tag: row.tag,
      taskId: row.task_id,
      title: row.title,
      description: row.description,
      status: row.status,
      priority: row.priority,
      dependencies: parseArray(row.dependencies_json),
      labels: parseArray(row.labels_json).filter((l): l is string => typeof l === 'string'),
      raw,
      sourceFile: row.source_file,
      sourceMtimeMs: row.source_mtime_ms,
      updatedAt: row.updated_at,
   };
}

function getTasksFilePath(projectRoot: string): string {
   return path.join(path.resolve(projectRoot), '.taskmaster', 'tasks', 'tasks.json');
}

/** Flattens a task tree into rows with dotted task IDs ("3", "3.1", "3.1.2"). */
function flattenTaskTree(
   tasks: TaskmasterTask[],
   parentId = ''
): Array<{ fullId: string; task: TaskmasterTask }> {
   const result: Array<{ fullId: string; task: TaskmasterTask }> = [];
   for (const task of tasks) {
      if (task == null || typeof task !== 'object' || task.id === undefined) continue;
      const fullId = parentId ? `${parentId}.${task.id}` : String(task.id);
      result.push({ fullId, task });
      if (Array.isArray(task.subtasks)) {
         result.push(...flattenTaskTree(task.subtasks, fullId));
      }
   }
   return result;
}

export interface RefreshResult {
   refreshed: boolean;
   taskCount: number;
   sourceMtimeMs: number | null;
   error?: string;
}

/**
 * Rebuilds the cache for a project from its tasks.json. Runs in a single
 * transaction: on any parse failure the previous cache rows are kept intact.
 */
export async function refreshTaskCache(
   db: DatabaseSync,
   projectRoot: string
): Promise<RefreshResult> {
   const resolvedRoot = path.resolve(projectRoot);
   const sourceFile = getTasksFilePath(resolvedRoot);

   let mtimeMs: number;
   let rawContent: string;
   try {
      const stat = await fs.stat(sourceFile);
      mtimeMs = Math.floor(stat.mtimeMs);
      rawContent = await fs.readFile(sourceFile, 'utf-8');
   } catch {
      // No tasks file: the canonical source says "no tasks" - clear the cache.
      db.prepare('DELETE FROM task_cache WHERE project_root = ?').run(resolvedRoot);
      return { refreshed: true, taskCount: 0, sourceMtimeMs: null };
   }

   let parsed: unknown;
   try {
      parsed = JSON.parse(rawContent);
   } catch (error) {
      // Likely a partial write by the Taskmaster CLI; keep the previous cache.
      return {
         refreshed: false,
         taskCount: countCachedTasks(db, resolvedRoot),
         sourceMtimeMs: null,
         error: `tasks.json is not valid JSON: ${error instanceof Error ? error.message : 'parse error'}`,
      };
   }

   let contexts: TagContexts;
   try {
      contexts = extractTagContexts(parsed);
   } catch (error) {
      // Unknown document shape: keep the previous cache and surface the error.
      return {
         refreshed: false,
         taskCount: countCachedTasks(db, resolvedRoot),
         sourceMtimeMs: null,
         error:
            error instanceof TaskLoadError
               ? error.message
               : 'tasks.json does not match a known Taskmaster format',
      };
   }
   const now = new Date().toISOString();
   const relativeSource = path.posix.join('.taskmaster', 'tasks', 'tasks.json');

   const insert = db.prepare(
      `INSERT INTO task_cache
         (id, project_root, tag, task_id, title, description, status, priority,
          dependencies_json, labels_json, raw_json, source_file, source_mtime_ms,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
   );

   let taskCount = 0;
   withTransaction(db, () => {
      db.prepare('DELETE FROM task_cache WHERE project_root = ?').run(resolvedRoot);
      for (const [tag, context] of Object.entries(contexts)) {
         for (const { fullId, task } of flattenTaskTree(context.tasks)) {
            insert.run(
               crypto.randomUUID(),
               resolvedRoot,
               tag,
               fullId,
               typeof task.title === 'string' ? task.title : null,
               typeof task.description === 'string' ? task.description : null,
               typeof task.status === 'string' ? task.status : null,
               typeof task.priority === 'string' ? task.priority : null,
               JSON.stringify(task.dependencies ?? []),
               JSON.stringify(task.labels ?? []),
               JSON.stringify(task),
               relativeSource,
               mtimeMs,
               now,
               now
            );
            taskCount++;
         }
      }
   });

   return { refreshed: true, taskCount, sourceMtimeMs: mtimeMs };
}

export function countCachedTasks(db: DatabaseSync, projectRoot: string): number {
   const row = db
      .prepare('SELECT COUNT(*) AS n FROM task_cache WHERE project_root = ?')
      .get(path.resolve(projectRoot)) as { n: number };
   return row.n;
}

/** Stored source mtime for a project's cache (null when empty). */
export function getCachedMtimeMs(db: DatabaseSync, projectRoot: string): number | null {
   const row = db
      .prepare('SELECT MAX(source_mtime_ms) AS m FROM task_cache WHERE project_root = ?')
      .get(path.resolve(projectRoot)) as { m: number | null };
   return row.m;
}

/**
 * Refreshes the cache only when tasks.json changed since the last refresh
 * (mtime comparison). This is how file-watcher-driven UI refetches keep the
 * cache in sync without a second file watcher process writing to SQLite.
 */
export async function refreshTaskCacheIfStale(
   db: DatabaseSync,
   projectRoot: string
): Promise<RefreshResult> {
   const sourceFile = getTasksFilePath(projectRoot);
   let currentMtimeMs: number | null = null;
   try {
      currentMtimeMs = Math.floor((await fs.stat(sourceFile)).mtimeMs);
   } catch {
      currentMtimeMs = null;
   }

   const cachedMtimeMs = getCachedMtimeMs(db, projectRoot);
   if (currentMtimeMs !== null && cachedMtimeMs === currentMtimeMs) {
      return {
         refreshed: false,
         taskCount: countCachedTasks(db, projectRoot),
         sourceMtimeMs: cachedMtimeMs,
      };
   }
   return refreshTaskCache(db, projectRoot);
}

export interface TaskCacheQuery {
   tag?: string;
   status?: string;
   priority?: string;
   label?: string;
   search?: string;
   limit?: number;
}

/** Lists cached tasks with optional filters. All values are bound parameters. */
export function getCachedTasks(
   db: DatabaseSync,
   projectRoot: string,
   query: TaskCacheQuery = {}
): CachedTask[] {
   const clauses = ['project_root = ?'];
   const params: Array<string | number> = [path.resolve(projectRoot)];

   if (query.tag) {
      clauses.push('tag = ?');
      params.push(query.tag);
   }
   if (query.status) {
      clauses.push('status = ?');
      params.push(query.status);
   }
   if (query.priority) {
      clauses.push('priority = ?');
      params.push(query.priority);
   }
   if (query.label) {
      // labels_json is a JSON array of strings; EXISTS over json_each matches exact labels.
      clauses.push(
         'EXISTS (SELECT 1 FROM json_each(task_cache.labels_json) WHERE json_each.value = ?)'
      );
      params.push(query.label);
   }
   if (query.search) {
      clauses.push('(title LIKE ? ESCAPE \'\\\' OR description LIKE ? ESCAPE \'\\\')');
      const escaped = query.search.replace(/[\\%_]/g, (c) => `\\${c}`);
      params.push(`%${escaped}%`, `%${escaped}%`);
   }

   const limit = Math.min(Math.max(1, Math.floor(query.limit ?? 500)), 2000);
   const rows = db
      .prepare(
         `SELECT * FROM task_cache WHERE ${clauses.join(' AND ')}
          ORDER BY tag, CAST(task_id AS TEXT) LIMIT ?`
      )
      .all(...params, limit) as unknown as CacheRow[];
   return rows.map(toCachedTask);
}

export function getCachedTaskById(
   db: DatabaseSync,
   projectRoot: string,
   tag: string,
   taskId: string
): CachedTask | null {
   const row = db
      .prepare('SELECT * FROM task_cache WHERE project_root = ? AND tag = ? AND task_id = ?')
      .get(path.resolve(projectRoot), tag, taskId) as unknown as CacheRow | undefined;
   return row ? toCachedTask(row) : null;
}
