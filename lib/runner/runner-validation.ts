import path from 'path';
import { promises as fs } from 'fs';
import { getTaskmasterPath } from '@/lib/taskmaster-paths';
import { RunnerErrorCode, RunnerMode, taskIdSchema, runIdSchema } from '@/types/runner';

/** Error type carrying a machine-readable code and an HTTP status. */
export class RunnerError extends Error {
   constructor(
      public code: RunnerErrorCode,
      message: string,
      public httpStatus: number = 400
   ) {
      super(message);
      this.name = 'RunnerError';
   }
}

export function isValidTaskId(taskId: string): boolean {
   return taskIdSchema.safeParse(taskId).success;
}

export function isValidRunId(runId: string): boolean {
   return runIdSchema.safeParse(runId).success;
}

/**
 * The Taskmaster CLI binary. Configurable via TASKMASTER_RUNNER_BIN for
 * non-standard installs; never influenced by client input.
 */
export function getTmBin(): string {
   return process.env.TASKMASTER_RUNNER_BIN?.trim() || 'tm';
}

/**
 * Maps a runner mode to the exact argv passed to the Taskmaster CLI.
 * This is the ONLY place commands are constructed - there is no path
 * where client-supplied strings become arguments other than the
 * already-validated numeric task ID.
 */
export function buildRunnerCommand(
   mode: RunnerMode,
   taskId?: string | null,
   tmBin: string = getTmBin()
): string[] {
   switch (mode) {
      case 'run-task':
      case 'run-next': {
         // run-next resolves the task ID server-side, then behaves like run-task.
         if (!taskId || !isValidTaskId(taskId)) {
            throw new RunnerError('INVALID_TASK_ID', `Invalid task ID: ${JSON.stringify(taskId)}`);
         }
         return [tmBin, 'start', taskId];
      }
      case 'loop':
         return [tmBin, 'loop', '--verbose'];
      case 'loop-sandbox':
         return [tmBin, 'loop', '--sandbox', '--verbose'];
      default: {
         const exhaustive: never = mode;
         throw new RunnerError('INTERNAL_ERROR', `Unknown runner mode: ${exhaustive}`, 500);
      }
   }
}

/** The single project root this server instance is configured to run in. */
export function getConfiguredProjectRoot(): string {
   // getTaskmasterPath() points at <projectRoot>/.taskmaster
   return path.dirname(path.resolve(getTaskmasterPath()));
}

/**
 * Validates an (optional) client-provided project root against the allowlist,
 * which for the MVP is exactly the server's configured root. The client value
 * is only compared - it is never used to construct paths.
 */
export async function resolveProjectRoot(requested?: string): Promise<string> {
   const configured = getConfiguredProjectRoot();

   if (requested !== undefined && path.resolve(requested) !== configured) {
      throw new RunnerError(
         'INVALID_PROJECT_ROOT',
         'projectRoot is not allowlisted for this Task Studio instance',
         403
      );
   }

   const tasksJson = path.join(configured, '.taskmaster', 'tasks', 'tasks.json');
   try {
      await fs.access(tasksJson);
   } catch {
      throw new RunnerError(
         'INVALID_PROJECT_ROOT',
         'Project root has no .taskmaster/tasks/tasks.json - is this a Taskmaster project?',
         400
      );
   }

   return configured;
}

/** Directory where run logs and metadata live. */
export function getRunsDir(projectRoot: string): string {
   return path.join(projectRoot, '.taskmaster', 'runs');
}

/** Path of the lock file used to detect concurrent/stale runners. */
export function getLockFilePath(projectRoot: string): string {
   return path.join(projectRoot, '.taskmaster', 'runner.lock');
}

/**
 * Resolves a run's log or metadata file inside the runs directory,
 * rejecting anything that would escape it (path traversal guard on top
 * of the runId charset validation).
 */
export function resolveRunFilePath(runsDir: string, runId: string, ext: '.log' | '.json'): string {
   if (!isValidRunId(runId)) {
      throw new RunnerError('INVALID_RUN_ID', 'Invalid run ID format');
   }
   const base = path.resolve(runsDir);
   const candidate = path.resolve(base, `${runId}${ext}`);
   if (!candidate.startsWith(base + path.sep)) {
      throw new RunnerError('INVALID_RUN_ID', 'Run ID resolves outside the runs directory');
   }
   return candidate;
}
