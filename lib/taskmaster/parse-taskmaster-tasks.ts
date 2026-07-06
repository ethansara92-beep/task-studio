import { TaskmasterTask } from '@/types/taskmaster';

/**
 * Parsing and normalization for Taskmaster `tasks.json` documents.
 *
 * `.taskmaster/tasks/tasks.json` is the canonical source of truth for tasks.
 * This module is the single place that understands its on-disk shapes:
 *
 * 1. Tagged (current):   { "master": { "tasks": [...], "metadata": {...} }, ... }
 * 2. Legacy flat object: { "tasks": [...] }
 * 3. Legacy array:       [ ...tasks ]
 *
 * Anything else is rejected with a typed UNSUPPORTED_FORMAT error instead of
 * being silently coerced (or worse, silently replaced with demo data).
 */

export type TaskLoadErrorCode =
   | 'PROJECT_ROOT_NOT_ALLOWLISTED'
   | 'PROJECT_ROOT_INVALID'
   | 'TASKS_FILE_NOT_FOUND'
   | 'INVALID_JSON'
   | 'UNSUPPORTED_FORMAT'
   | 'PERMISSION_DENIED'
   | 'TAG_NOT_FOUND';

/** Error carrying a machine-readable code and an HTTP status for API routes. */
export class TaskLoadError extends Error {
   constructor(
      public code: TaskLoadErrorCode,
      message: string,
      public httpStatus: number = 400
   ) {
      super(message);
      this.name = 'TaskLoadError';
   }
}

export interface TagContext {
   tasks: TaskmasterTask[];
   metadata: Record<string, unknown> | null;
}

export type TagContexts = Record<string, TagContext>;

function isTaskLike(value: unknown): value is Record<string, unknown> {
   return (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).id !== undefined
   );
}

/**
 * Extracts `{ tag -> { tasks, metadata } }` from a parsed tasks.json document.
 * Throws TaskLoadError('UNSUPPORTED_FORMAT') when the document matches none of
 * the known Taskmaster shapes.
 */
export function extractTagContexts(parsed: unknown): TagContexts {
   // Legacy array format: [ ...tasks ]
   if (Array.isArray(parsed)) {
      if (parsed.length > 0 && !parsed.every(isTaskLike)) {
         throw new TaskLoadError(
            'UNSUPPORTED_FORMAT',
            'tasks.json is an array, but its entries do not look like Taskmaster tasks (missing "id")',
            422
         );
      }
      return { master: { tasks: parsed as TaskmasterTask[], metadata: null } };
   }

   if (parsed === null || typeof parsed !== 'object') {
      throw new TaskLoadError(
         'UNSUPPORTED_FORMAT',
         'tasks.json must be a JSON object or array of tasks',
         422
      );
   }

   const doc = parsed as Record<string, unknown>;

   // Legacy flat format: { "tasks": [...] }
   if (Array.isArray(doc.tasks)) {
      return {
         master: {
            tasks: doc.tasks as TaskmasterTask[],
            metadata:
               doc.metadata !== null && typeof doc.metadata === 'object'
                  ? (doc.metadata as Record<string, unknown>)
                  : null,
         },
      };
   }

   // Tagged format: { "<tag>": { "tasks": [...], "metadata": {...} }, ... }
   const contexts: TagContexts = {};
   for (const [tag, value] of Object.entries(doc)) {
      if (value !== null && typeof value === 'object' && Array.isArray((value as any).tasks)) {
         const tagValue = value as { tasks: TaskmasterTask[]; metadata?: unknown };
         contexts[tag] = {
            tasks: tagValue.tasks,
            metadata:
               tagValue.metadata !== null && typeof tagValue.metadata === 'object'
                  ? (tagValue.metadata as Record<string, unknown>)
                  : null,
         };
      }
   }

   if (Object.keys(contexts).length === 0) {
      // An empty object is a valid "no tags yet" document; anything with keys
      // but no recognizable tag contexts is not a Taskmaster file.
      if (Object.keys(doc).length === 0) {
         return {};
      }
      throw new TaskLoadError(
         'UNSUPPORTED_FORMAT',
         'tasks.json does not match any known Taskmaster format (expected tagged contexts, { "tasks": [...] }, or an array of tasks)',
         422
      );
   }

   return contexts;
}

/**
 * Normalized task shape used for the SQLite task_cache and diagnostics.
 * `raw` preserves the original JSON for debugging and future features.
 */
export interface NormalizedTask {
   id: string;
   title: string;
   description: string;
   status: string;
   priority: string;
   dependencies: string[];
   details: string;
   testStrategy: string;
   subtasks: NormalizedTask[];
   raw: unknown;
}

function asString(value: unknown, fallback = ''): string {
   if (typeof value === 'string') return value;
   if (typeof value === 'number') return String(value);
   return fallback;
}

/** Normalizes one raw task (and its subtasks, recursively). */
export function normalizeTask(raw: unknown): NormalizedTask {
   const task = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
   return {
      id: asString(task.id),
      title: asString(task.title),
      description: asString(task.description),
      status: asString(task.status, 'pending'),
      priority: asString(task.priority, 'medium'),
      dependencies: Array.isArray(task.dependencies) ? task.dependencies.map((d) => asString(d)) : [],
      details: asString(task.details),
      testStrategy: asString(task.testStrategy),
      subtasks: Array.isArray(task.subtasks) ? task.subtasks.map(normalizeTask) : [],
      raw,
   };
}

/**
 * Parses a tasks.json document into normalized tasks per tag.
 * Throws TaskLoadError('UNSUPPORTED_FORMAT') for unknown shapes.
 */
export function parseTaskmasterTasks(
   parsed: unknown
): Record<string, { tasks: NormalizedTask[]; metadata: Record<string, unknown> | null }> {
   const contexts = extractTagContexts(parsed);
   const result: Record<string, { tasks: NormalizedTask[]; metadata: Record<string, unknown> | null }> =
      {};
   for (const [tag, context] of Object.entries(contexts)) {
      result[tag] = {
         tasks: context.tasks.map(normalizeTask),
         metadata: context.metadata,
      };
   }
   return result;
}

/** Counts tasks including nested subtasks. */
export function countTasks(contexts: TagContexts): number {
   let count = 0;
   const walk = (tasks: TaskmasterTask[]) => {
      for (const task of tasks) {
         count++;
         if (Array.isArray(task.subtasks)) walk(task.subtasks);
      }
   };
   for (const context of Object.values(contexts)) {
      walk(context.tasks);
   }
   return count;
}
