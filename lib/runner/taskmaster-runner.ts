import { spawn, ChildProcess } from 'node:child_process';
import { createWriteStream, WriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {
   RunRecord,
   RunnerLockInfo,
   RunnerMode,
   RunnerStatusData,
   RunnerLogsData,
} from '@/types/runner';
import {
   RunnerError,
   buildRunnerCommand,
   getLockFilePath,
   getRunsDir,
   getTmBin,
   resolveRunFilePath,
} from './runner-validation';

const GRACEFUL_KILL_TIMEOUT_MS = 5000;
const RECENT_RUNS_LIMIT = 20;
const MAX_LOG_RESPONSE_BYTES = 256 * 1024; // 256KB tail per request

interface ActiveRun {
   record: RunRecord;
   child: ChildProcess | null;
   logStream: WriteStream | null;
   cancelRequested: boolean;
}

/**
 * In-memory registry of active runs, keyed by project root.
 * Stored on globalThis so Next.js dev-mode HMR does not orphan
 * spawned processes when this module is re-evaluated.
 *
 * This is deliberately a single-slot-per-project registry (MVP: one active
 * runner per project root). A durable queue can replace it later by swapping
 * this map for a persistent store while keeping the same public functions.
 */
const globalStore = globalThis as unknown as {
   __taskmasterRunnerRegistry?: Map<string, ActiveRun>;
};
const activeRuns: Map<string, ActiveRun> = (globalStore.__taskmasterRunnerRegistry ??= new Map());

function createRunId(): string {
   const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
   return `${timestamp}-${crypto.randomBytes(3).toString('hex')}`;
}

function isPidAlive(pid: number): boolean {
   try {
      process.kill(pid, 0);
      return true;
   } catch (error) {
      // EPERM means the process exists but belongs to someone else.
      return (error as NodeJS.ErrnoException).code === 'EPERM';
   }
}

async function writeRunMetadata(projectRoot: string, record: RunRecord): Promise<void> {
   const metaPath = resolveRunFilePath(getRunsDir(projectRoot), record.runId, '.json');
   // Persist projectRoot on disk for future tooling, but keep it out of the
   // in-memory record that gets returned to the browser.
   const persisted = { ...record, projectRoot };
   const tmpPath = `${metaPath}.tmp`;
   await fs.writeFile(tmpPath, JSON.stringify(persisted, null, 2), 'utf-8');
   await fs.rename(tmpPath, metaPath);
}

async function writeLockFile(projectRoot: string, record: RunRecord): Promise<void> {
   const lock = { runId: record.runId, pid: record.pid, startedAt: record.startedAt };
   await fs.writeFile(getLockFilePath(projectRoot), JSON.stringify(lock, null, 2), 'utf-8');
}

async function removeLockFile(projectRoot: string): Promise<void> {
   try {
      await fs.unlink(getLockFilePath(projectRoot));
   } catch {
      // Already gone - fine.
   }
}

async function readLockFile(projectRoot: string): Promise<RunnerLockInfo | null> {
   try {
      const raw = await fs.readFile(getLockFilePath(projectRoot), 'utf-8');
      const lock = JSON.parse(raw);
      if (typeof lock.pid !== 'number' || typeof lock.runId !== 'string') return null;
      return {
         runId: lock.runId,
         pid: lock.pid,
         startedAt: lock.startedAt ?? '',
         stale: !isPidAlive(lock.pid),
      };
   } catch {
      return null;
   }
}

/** Kill a child and (on POSIX) its whole process group, since `tm` spawns Claude Code as a grandchild. */
function killRunProcess(child: ChildProcess, signal: NodeJS.Signals): void {
   if (!child.pid) return;
   try {
      if (process.platform !== 'win32') {
         process.kill(-child.pid, signal);
      } else {
         child.kill(signal);
      }
   } catch {
      // Process group may already be gone; try the direct child as fallback.
      try {
         child.kill(signal);
      } catch {
         // Already dead.
      }
   }
}

export interface StartRunOptions {
   projectRoot: string;
   mode: RunnerMode;
   taskId?: string | null;
}

/**
 * Creates a run record, spawns the Taskmaster CLI with a fixed argv
 * (shell: false, no client-controlled strings beyond the validated task ID),
 * and streams stdout/stderr to `.taskmaster/runs/<runId>.log`.
 */
export async function startRun(options: StartRunOptions): Promise<RunRecord> {
   const { projectRoot, mode, taskId = null } = options;

   const command = buildRunnerCommand(mode, taskId);

   // Reserve the per-project slot synchronously (before any await) so two
   // concurrent requests cannot both pass the busy check.
   const existing = activeRuns.get(projectRoot);
   if (existing) {
      throw new RunnerError(
         'RUNNER_BUSY',
         `A run is already active (${existing.record.runId}, mode: ${existing.record.mode}). Stop it first.`,
         409
      );
   }

   const runId = createRunId();
   const record: RunRecord = {
      runId,
      mode,
      taskId,
      command,
      status: 'queued',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      exitCode: null,
      error: null,
      logFile: path.posix.join('.taskmaster', 'runs', `${runId}.log`),
      pid: null,
   };

   const activeRun: ActiveRun = { record, child: null, logStream: null, cancelRequested: false };
   activeRuns.set(projectRoot, activeRun);

   try {
      // A lock file with a live pid means another runner (possibly from a
      // previous server instance) is still working in this repo.
      const lock = await readLockFile(projectRoot);
      if (lock && !lock.stale) {
         throw new RunnerError(
            'RUNNER_BUSY',
            `Lock file .taskmaster/runner.lock reports an active run (pid ${lock.pid}). ` +
               'If this is wrong, delete the lock file and retry.',
            409
         );
      }
      if (lock?.stale) {
         await removeLockFile(projectRoot);
      }

      const runsDir = getRunsDir(projectRoot);
      await fs.mkdir(runsDir, { recursive: true });

      const logPath = resolveRunFilePath(runsDir, record.runId, '.log');
      const logStream = createWriteStream(logPath, { flags: 'a' });
      activeRun.logStream = logStream;
      logStream.write(
         `[runner] ${record.startedAt} spawning: ${command.join(' ')} (mode: ${mode})\n`
      );

      await writeRunMetadata(projectRoot, record);

      const child = spawn(command[0], command.slice(1), {
         cwd: projectRoot,
         shell: false,
         stdio: ['ignore', 'pipe', 'pipe'],
         // Own process group on POSIX so stop() can kill tm AND the Claude
         // Code process it spawns.
         detached: process.platform !== 'win32',
         env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      });
      activeRun.child = child;

      // spawn() reports a missing binary via the 'error' event, not by throwing.
      await new Promise<void>((resolve, reject) => {
         child.once('spawn', () => resolve());
         child.once('error', (error) => reject(error));
      });

      record.status = 'running';
      record.pid = child.pid ?? null;

      child.stdout?.on('data', (chunk) => logStream.write(chunk));
      child.stderr?.on('data', (chunk) => logStream.write(chunk));

      child.on('error', (error) => {
         logStream.write(`\n[runner] process error: ${error.message}\n`);
      });

      // 'close' (not 'exit') so stdout/stderr are fully flushed first.
      child.on('close', (code, signal) => {
         void finalizeRun(projectRoot, activeRun, code, signal);
      });

      await writeLockFile(projectRoot, record);
      await writeRunMetadata(projectRoot, record);

      return { ...record };
   } catch (error) {
      // Roll back the reservation on any startup failure.
      activeRuns.delete(projectRoot);
      activeRun.logStream?.end();

      record.status = 'failed';
      record.finishedAt = new Date().toISOString();

      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
         record.error =
            `Taskmaster CLI ('${getTmBin()}') was not found on PATH. ` +
            'Install Taskmaster and make sure the tm command works in a terminal ' +
            '(or set TASKMASTER_RUNNER_BIN to its full path).';
         await writeRunMetadata(projectRoot, record).catch(() => {});
         throw new RunnerError('TM_NOT_FOUND', record.error, 500);
      }

      record.error = error instanceof Error ? error.message : String(error);
      if (error instanceof RunnerError) throw error;
      await writeRunMetadata(projectRoot, record).catch(() => {});
      throw new RunnerError('INTERNAL_ERROR', record.error, 500);
   }
}

async function finalizeRun(
   projectRoot: string,
   activeRun: ActiveRun,
   exitCode: number | null,
   signal: NodeJS.Signals | null
): Promise<void> {
   const { record } = activeRun;
   record.finishedAt = new Date().toISOString();
   record.exitCode = exitCode;

   if (activeRun.cancelRequested) {
      record.status = 'cancelled';
      record.error = null;
   } else if (exitCode === 0) {
      record.status = 'completed';
   } else {
      record.status = 'failed';
      record.error = signal
         ? `Process terminated by signal ${signal}`
         : `Process exited with code ${exitCode}`;
   }

   activeRun.logStream?.write(
      `\n[runner] ${record.finishedAt} finished with status '${record.status}'` +
         (exitCode !== null ? ` (exit code ${exitCode})` : '') +
         '\n'
   );
   activeRun.logStream?.end();

   // Persist the final state BEFORE releasing the in-memory slot, so a
   // concurrent status read never sees a stale 'running' metadata file
   // without a matching active run.
   await writeRunMetadata(projectRoot, record).catch(() => {});
   await removeLockFile(projectRoot);
   activeRuns.delete(projectRoot);
}

/**
 * Requests cancellation: SIGTERM to the process group, escalating to
 * SIGKILL after a timeout. The run is marked `cancelled` when the process
 * actually exits (in finalizeRun).
 */
export async function stopRun(projectRoot: string, runId: string): Promise<RunRecord> {
   const activeRun = activeRuns.get(projectRoot);
   if (!activeRun || activeRun.record.runId !== runId) {
      throw new RunnerError('RUN_NOT_FOUND', `No active run with ID '${runId}'`, 404);
   }

   activeRun.cancelRequested = true;
   const child = activeRun.child;
   if (child) {
      killRunProcess(child, 'SIGTERM');
      const killTimer = setTimeout(() => {
         if (activeRuns.get(projectRoot) === activeRun) {
            killRunProcess(child, 'SIGKILL');
         }
      }, GRACEFUL_KILL_TIMEOUT_MS);
      killTimer.unref();
   }

   return { ...activeRun.record };
}

/** The currently active run for a project, if any. */
export function getActiveRun(projectRoot: string): RunRecord | null {
   const activeRun = activeRuns.get(projectRoot);
   return activeRun ? { ...activeRun.record } : null;
}

/**
 * Reads recent run metadata from `.taskmaster/runs/`, newest first.
 * Runs left in `running` state by a crashed/restarted server are
 * reconciled to `failed` when their pid is gone.
 */
export async function getRunnerStatus(projectRoot: string): Promise<RunnerStatusData> {
   const runsDir = getRunsDir(projectRoot);
   const active = getActiveRun(projectRoot);

   let entries: string[] = [];
   try {
      entries = await fs.readdir(runsDir);
   } catch {
      // Runs directory does not exist yet - no history.
   }

   const metaFiles = entries
      .filter((name) => name.endsWith('.json'))
      .sort()
      .reverse();
   const recentRuns: RunRecord[] = [];

   for (const name of metaFiles.slice(0, RECENT_RUNS_LIMIT)) {
      try {
         const raw = await fs.readFile(path.join(runsDir, name), 'utf-8');
         const parsed = JSON.parse(raw) as RunRecord & { projectRoot?: string };
         // Strip the persisted absolute projectRoot before returning to the browser.
         const record = { ...parsed };
         delete record.projectRoot;

         const isTrackedActive = active?.runId === record.runId;
         if (!isTrackedActive && (record.status === 'running' || record.status === 'queued')) {
            const alive = record.pid !== null && isPidAlive(record.pid);
            if (!alive) {
               record.status = 'failed';
               record.finishedAt = record.finishedAt ?? new Date().toISOString();
               record.error = 'Process is no longer running (server was restarted or crashed)';
               await writeRunMetadata(projectRoot, record).catch(() => {});
            }
         }
         recentRuns.push(record);
      } catch {
         // Skip unreadable metadata files.
      }
   }

   recentRuns.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

   const lock = await readLockFile(projectRoot);

   return { activeRun: active, lock, recentRuns };
}

/**
 * Returns the tail of a run's log (bounded to MAX_LOG_RESPONSE_BYTES).
 * The runId is charset-validated and path-resolved inside the runs dir.
 */
export async function readRunLog(
   projectRoot: string,
   runId: string,
   maxBytes: number = MAX_LOG_RESPONSE_BYTES
): Promise<RunnerLogsData> {
   const cappedMax = Math.min(Math.max(1024, maxBytes), MAX_LOG_RESPONSE_BYTES);
   const logPath = resolveRunFilePath(getRunsDir(projectRoot), runId, '.log');

   let handle;
   try {
      handle = await fs.open(logPath, 'r');
   } catch {
      throw new RunnerError('LOG_NOT_FOUND', `No log found for run '${runId}'`, 404);
   }

   try {
      const { size } = await handle.stat();
      const truncated = size > cappedMax;
      const readLength = truncated ? cappedMax : size;
      const position = truncated ? size - cappedMax : 0;
      const buffer = Buffer.alloc(readLength);
      await handle.read(buffer, 0, readLength, position);

      return {
         runId,
         content: buffer.toString('utf-8'),
         sizeBytes: size,
         truncated,
      };
   } finally {
      await handle.close();
   }
}
