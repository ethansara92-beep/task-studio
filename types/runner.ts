import { z } from 'zod';

// Runner modes are a fixed allowlist - the client can never pass a command or args.
export const RUNNER_MODES = ['run-task', 'run-next', 'loop', 'loop-sandbox'] as const;
export type RunnerMode = (typeof RUNNER_MODES)[number];

export const RUN_STATUSES = ['queued', 'running', 'completed', 'failed', 'cancelled'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

// Machine-readable error codes so the UI can show specific messages.
export type RunnerErrorCode =
   | 'INVALID_TASK_ID'
   | 'INVALID_PROJECT_ROOT'
   | 'INVALID_RUN_ID'
   | 'RUNNER_BUSY'
   | 'TM_NOT_FOUND'
   | 'RUN_NOT_FOUND'
   | 'LOG_NOT_FOUND'
   | 'NO_NEXT_TASK'
   | 'INTERNAL_ERROR';

/**
 * Run metadata persisted as `.taskmaster/runs/<runId>.json`.
 * `logFile` is always relative to the project root so absolute paths
 * are not leaked to the browser.
 */
export interface RunRecord {
   runId: string;
   mode: RunnerMode;
   taskId: string | null;
   command: string[];
   status: RunStatus;
   startedAt: string;
   finishedAt: string | null;
   exitCode: number | null;
   error: string | null;
   logFile: string;
   pid: number | null;
}

/** Contents of `.taskmaster/runner.lock`. */
export interface RunnerLockInfo {
   runId: string;
   pid: number;
   startedAt: string;
   /** True when the lock file exists but its process is no longer alive. */
   stale: boolean;
}

export interface RunnerStatusData {
   activeRun: RunRecord | null;
   lock: RunnerLockInfo | null;
   recentRuns: RunRecord[];
}

export interface RunnerLogsData {
   runId: string;
   content: string;
   sizeBytes: number;
   truncated: boolean;
}

export interface RunnerApiResponse<T = unknown> {
   success: boolean;
   data?: T;
   error?: string;
   code?: RunnerErrorCode;
   timestamp: string;
}

// Zod schemas -----------------------------------------------------------

/** Taskmaster task IDs: "12" or dotted subtask paths like "12.3.1". */
export const taskIdSchema = z
   .string()
   .min(1, 'Task ID is required')
   .max(32, 'Task ID is too long')
   .regex(/^\d+(\.\d+)*$/, 'Task ID must be numeric (e.g. "12" or "12.3")');

/** Run IDs are generated server-side; only a safe charset is accepted back. */
export const runIdSchema = z
   .string()
   .min(8, 'Run ID is too short')
   .max(80, 'Run ID is too long')
   .regex(/^[A-Za-z0-9-]+$/, 'Run ID contains invalid characters');

/**
 * `projectRoot` is optional and only ever compared against the server's own
 * configured project root - it is never used to build a path directly.
 */
const projectRootSchema = z.string().min(1).max(1000).optional();

export const runTaskRequestSchema = z.object({
   taskId: taskIdSchema,
   projectRoot: projectRootSchema,
});

export const runNextRequestSchema = z.object({
   projectRoot: projectRootSchema,
});

export const startLoopRequestSchema = z.object({
   projectRoot: projectRootSchema,
   sandbox: z.boolean().optional().default(false),
});

export const stopRunRequestSchema = z.object({
   runId: runIdSchema,
   projectRoot: projectRootSchema,
});

export type RunTaskRequest = z.infer<typeof runTaskRequestSchema>;
export type RunNextRequest = z.infer<typeof runNextRequestSchema>;
export type StartLoopRequest = z.infer<typeof startLoopRequestSchema>;
export type StopRunRequest = z.infer<typeof stopRunRequestSchema>;
