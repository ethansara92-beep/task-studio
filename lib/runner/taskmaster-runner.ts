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
   resolveRunFilePath,
} from './runner-validation';
import { RunnerRuntimeConfig, getRunnerRuntimeConfig } from './runner-config';
import { appendAuditLog } from '@/lib/settings/settings-service';

const DEFAULT_GRACEFUL_KILL_TIMEOUT_MS = 5000;
const RECENT_RUNS_LIMIT = 20;
const MAX_LOG_RESPONSE_BYTES = 2 * 1024 * 1024; // absolute 2MB ceiling per request

interface ActiveRun {
   record: RunRecord;
   child: ChildProcess | null;
   logStream: WriteStream | null;
   cancelRequested: boolean;
   stopGraceTimeoutMs: number;
   auditEnabled: boolean;
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
   const tmpPath = `${metaPath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
   await fs.writeFile(tmpPath, JSON.stringify(persisted, null, 2), 'utf-8');
   await fs.rename(tmpPath, metaPath);
}

/**
 * Per-run serialization of persistence. A fast-exiting process makes
 * finalizeRun (from 'close') race with startRun's own post-spawn writes;
 * chaining them guarantees ordering and lets startRun observe that the
 * run already finished.
 */
const runPersistChains = new Map<string, Promise<void>>();
function withRunPersistLock(runId: string, fn: () => Promise<void>): Promise<void> {
   const prev = runPersistChains.get(runId) ?? Promise.resolve();
   const next = prev.then(fn, fn);
   runPersistChains.set(
      runId,
      next.catch(() => {})
   );
   return next;
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
   /** Pre-resolved runtime config; loaded from settings when omitted. */
   config?: RunnerRuntimeConfig;
}

/**
 * Creates a run record, spawns the Taskmaster CLI with a fixed argv
 * (shell: false, no client-controlled strings beyond the validated task ID),
 * and streams stdout/stderr to `.taskmaster/runs/<runId>.log`.
 */
export async function startRun(options: StartRunOptions): Promise<RunRecord> {
   const { projectRoot, mode, taskId = null } = options;
   const config = options.config ?? (await getRunnerRuntimeConfig(projectRoot));

   const command = buildRunnerCommand(mode, taskId, config.tmBin);

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

   const activeRun: ActiveRun = {
      record,
      child: null,
      logStream: null,
      cancelRequested: false,
      stopGraceTimeoutMs: config.stopGraceTimeoutMs,
      auditEnabled: config.auditEnabled,
   };
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
         env: { ...process.env, ...config.extraEnv, FORCE_COLOR: '0', NO_COLOR: '1' },
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

      await withRunPersistLock(record.runId, async () => {
         // If the process already exited, finalizeRun has cleaned up - do not
         // resurrect the lock file or overwrite the final metadata.
         if (activeRuns.get(projectRoot) !== activeRun) return;
         await writeLockFile(projectRoot, record);
         await writeRunMetadata(projectRoot, record);
      });
      void appendAuditLog('runner.started', `Run ${record.runId} started (mode: ${mode})`, {
         enabled: config.auditEnabled,
      });

      return { ...record };
   } catch (error) {
      // Roll back the reservation on any startup failure.
      activeRuns.delete(projectRoot);
      activeRun.logStream?.end();

      record.status = 'failed';
      record.finishedAt = new Date().toISOString();

      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
         record.error =
            `Taskmaster CLI ('${config.tmBin}') was not found. ` +
            'Install Taskmaster and make sure the command works in a terminal, ' +
            'or set its path in Settings → Taskmaster & Claude Code.';
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
   // without a matching active run. Serialized against startRun's own
   // writes for fast-exiting processes.
   await withRunPersistLock(record.runId, async () => {
      await writeRunMetadata(projectRoot, record).catch(() => {});
      await removeLockFile(projectRoot);
      activeRuns.delete(projectRoot);
   });
   runPersistChains.delete(record.runId);

   void appendAuditLog(
      'runner.stopped',
      `Run ${record.runId} finished with status '${record.status}'`,
      { enabled: activeRun.auditEnabled }
   );
   void pruneRunHistory(projectRoot).catch(() => {});
}

/**
 * Applies retention settings: keeps only the newest N run records and
 * deletes log/metadata files older than the retention window. Never touches
 * the active run.
 */
export async function pruneRunHistory(projectRoot: string): Promise<void> {
   const { historyLimit, logRetentionDays } = await getRunnerRuntimeConfig(projectRoot);
   const runsDir = getRunsDir(projectRoot);
   const active = getActiveRun(projectRoot);

   let entries: string[];
   try {
      entries = await fs.readdir(runsDir);
   } catch {
      return;
   }

   // Run IDs sort chronologically (ISO-timestamp prefix), newest last.
   const runIds = entries
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.replace(/\.json$/, ''))
      .sort();

   const cutoff = Date.now() - logRetentionDays * 24 * 60 * 60 * 1000;
   const keep = new Set(runIds.slice(-historyLimit));

   for (const runId of runIds) {
      if (active?.runId === runId) continue;
      const tooMany = !keep.has(runId);
      // The timestamp prefix (YYYY-MM-DDTHH-MM-SS) is parseable after
      // restoring the time separators.
      const stampMatch = runId.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/);
      const startedMs = stampMatch
         ? Date.parse(`${stampMatch[1]}T${stampMatch[2]}:${stampMatch[3]}:${stampMatch[4]}Z`)
         : NaN;
      const tooOld = Number.isFinite(startedMs) && startedMs < cutoff;
      if (tooMany || tooOld) {
         await fs.unlink(path.join(runsDir, `${runId}.json`)).catch(() => {});
         await fs.unlink(path.join(runsDir, `${runId}.log`)).catch(() => {});
      }
   }
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
      }, activeRun.stopGraceTimeoutMs || DEFAULT_GRACEFUL_KILL_TIMEOUT_MS);
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
