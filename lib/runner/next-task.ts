import path from 'path';
import { promises as fs } from 'fs';
import { RunnerError } from './runner-validation';

interface RawTask {
   id: number;
   status?: string;
   dependencies?: Array<number | string>;
}

const DONE_STATUSES = new Set(['done', 'completed']);

async function readCurrentTagTasks(
   projectRoot: string
): Promise<{ tasks: RawTask[]; currentTag: string }> {
   const taskmasterDir = path.join(projectRoot, '.taskmaster');

   let currentTag = 'master';
   try {
      const stateRaw = await fs.readFile(path.join(taskmasterDir, 'state.json'), 'utf-8');
      const state = JSON.parse(stateRaw);
      if (typeof state.currentTag === 'string' && state.currentTag) {
         currentTag = state.currentTag;
      }
   } catch {
      // No state file - fall back to the master tag.
   }

   try {
      const tasksRaw = await fs.readFile(path.join(taskmasterDir, 'tasks', 'tasks.json'), 'utf-8');
      const data = JSON.parse(tasksRaw);
      return { tasks: data?.[currentTag]?.tasks ?? [], currentTag };
   } catch {
      throw new RunnerError('INVALID_PROJECT_ROOT', 'Failed to read .taskmaster/tasks/tasks.json');
   }
}

/**
 * Resolves the next eligible task in the current tag: the lowest-ID task
 * that is `pending` and whose dependencies are all done.
 *
 * The Taskmaster CLI does not expose a non-interactive "start next" command,
 * so the runner computes the next task from tasks.json itself and then runs
 * `tm start <id>` - a single, bounded run rather than an open-ended loop.
 */
export async function findNextTaskId(projectRoot: string): Promise<string> {
   const { tasks, currentTag } = await readCurrentTagTasks(projectRoot);
   const byId = new Map<number, RawTask>(tasks.map((t) => [t.id, t]));

   const eligible = tasks
      .filter((task) => {
         if (task.status !== 'pending') return false;
         const deps = task.dependencies ?? [];
         return deps.every((dep) => {
            const depTask = byId.get(typeof dep === 'string' ? parseInt(dep, 10) : dep);
            return depTask ? DONE_STATUSES.has(depTask.status ?? '') : true;
         });
      })
      .sort((a, b) => a.id - b.id);

   if (eligible.length === 0) {
      throw new RunnerError(
         'NO_NEXT_TASK',
         `No eligible pending task found in tag '${currentTag}'`,
         404
      );
   }

   return String(eligible[0].id);
}

export interface DependencyCheckResult {
   complete: boolean;
   incomplete: number[];
}

/**
 * Checks whether a task's dependencies are all done. Subtask IDs ("12.3")
 * are checked against their parent task's dependencies.
 */
export async function checkTaskDependencies(
   projectRoot: string,
   taskId: string
): Promise<DependencyCheckResult> {
   const { tasks } = await readCurrentTagTasks(projectRoot);
   const byId = new Map<number, RawTask>(tasks.map((t) => [t.id, t]));

   const mainId = parseInt(taskId.split('.')[0], 10);
   const task = byId.get(mainId);
   if (!task) return { complete: true, incomplete: [] };

   const incomplete = (task.dependencies ?? [])
      .map((dep) => (typeof dep === 'string' ? parseInt(dep, 10) : dep))
      .filter((depId) => {
         const depTask = byId.get(depId);
         return depTask ? !DONE_STATUSES.has(depTask.status ?? '') : false;
      });

   return { complete: incomplete.length === 0, incomplete };
}
