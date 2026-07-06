import crypto from 'node:crypto';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { RunRecord, RunStatus, RunnerMode } from '@/types/runner';
import { RUN_STATUSES, RUNNER_MODES } from '@/types/runner';

/**
 * Runner history, locks and log metadata.
 *
 * The database is the queryable history/index. Per-run artifacts stay on
 * disk: full logs live in `.taskmaster/runs/<runId>.log` (only their metadata
 * is indexed here) and `.taskmaster/runner.lock` remains the cross-process
 * enforcement lock, mirrored into `runner_locks` for status/diagnostics.
 *
 * `command_json` always stores the structured argv array (e.g.
 * ["tm", "start", "12"]) that was built server-side from the fixed mode
 * allowlist - arbitrary command strings are never accepted or stored.
 */

interface RunRow {
   id: string;
   project_root: string;
   task_id: string | null;
   mode: string;
   command_json: string;
   status: string;
   started_at: string;
   finished_at: string | null;
   exit_code: number | null;
   error: string | null;
   log_file: string | null;
   pid: number | null;
}

function toRunRecord(row: RunRow): RunRecord {
   let command: string[] = [];
   try {
      const parsed = JSON.parse(row.command_json);
      if (Array.isArray(parsed) && parsed.every((p) => typeof p === 'string')) command = parsed;
   } catch {
      // Leave the command empty rather than fail the whole listing.
   }
   return {
      runId: row.id,
      mode: (RUNNER_MODES as readonly string[]).includes(row.mode)
         ? (row.mode as RunnerMode)
         : 'run-task',
      taskId: row.task_id,
      command,
      status: (RUN_STATUSES as readonly string[]).includes(row.status)
         ? (row.status as RunStatus)
         : 'failed',
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      exitCode: row.exit_code,
      error: row.error,
      logFile: row.log_file ?? '',
      pid: row.pid,
   };
}

/** Inserts or replaces a run row from a RunRecord (idempotent by run id). */
export function upsertRun(db: DatabaseSync, projectRoot: string, record: RunRecord): void {
   const now = new Date().toISOString();
   db.prepare(
      `INSERT INTO runner_runs
         (id, project_root, task_id, mode, command_json, status, started_at, finished_at,
          exit_code, error, log_file, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         status = excluded.status,
         finished_at = excluded.finished_at,
         exit_code = excluded.exit_code,
         error = excluded.error,
         log_file = excluded.log_file,
         metadata_json = excluded.metadata_json,
         updated_at = excluded.updated_at`
   ).run(
      record.runId,
      path.resolve(projectRoot),
      record.taskId,
      record.mode,
      JSON.stringify(record.command),
      record.status,
      record.startedAt,
      record.finishedAt,
      record.exitCode,
      record.error,
      record.logFile,
      JSON.stringify({ pid: record.pid }),
      now,
      now
   );
}

/**
 * Inserts a run only when no row exists yet (used to backfill history from
 * legacy `.taskmaster/runs/*.json` files without clobbering newer DB state).
 */
export function insertRunIfMissing(db: DatabaseSync, projectRoot: string, record: RunRecord): void {
   const now = new Date().toISOString();
   db.prepare(
      `INSERT INTO runner_runs
         (id, project_root, task_id, mode, command_json, status, started_at, finished_at,
          exit_code, error, log_file, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`
   ).run(
      record.runId,
      path.resolve(projectRoot),
      record.taskId,
      record.mode,
      JSON.stringify(record.command),
      record.status,
      record.startedAt,
      record.finishedAt,
      record.exitCode,
      record.error,
      record.logFile,
      JSON.stringify({ pid: record.pid }),
      now,
      now
   );
}

export function getRun(db: DatabaseSync, runId: string): RunRecord | null {
   const row = db
      .prepare(
         `SELECT r.*, json_extract(r.metadata_json, '$.pid') AS pid
          FROM runner_runs r WHERE r.id = ?`
      )
      .get(runId) as unknown as RunRow | undefined;
   return row ? toRunRecord(row) : null;
}

export function listRecentRuns(db: DatabaseSync, projectRoot: string, limit: number): RunRecord[] {
   const rows = db
      .prepare(
         `SELECT r.*, json_extract(r.metadata_json, '$.pid') AS pid
          FROM runner_runs r
          WHERE r.project_root = ?
          ORDER BY r.started_at DESC
          LIMIT ?`
      )
      .all(path.resolve(projectRoot), Math.max(1, Math.floor(limit))) as unknown as RunRow[];
   return rows.map(toRunRecord);
}

/** Marks a run failed/finished (server crash reconciliation). */
export function markRunInterrupted(db: DatabaseSync, runId: string, error: string): void {
   const now = new Date().toISOString();
   db.prepare(
      `UPDATE runner_runs
       SET status = 'failed', error = ?, finished_at = COALESCE(finished_at, ?), updated_at = ?
       WHERE id = ? AND status IN ('queued', 'running')`
   ).run(error, now, now, runId);
}

/** Deletes run rows (and cascaded log index rows) for a project. */
export function deleteRuns(db: DatabaseSync, projectRoot: string, runIds?: string[]): number {
   const resolved = path.resolve(projectRoot);
   if (runIds === undefined) {
      return db.prepare('DELETE FROM runner_runs WHERE project_root = ?').run(resolved)
         .changes as number;
   }
   let changes = 0;
   const remove = db.prepare('DELETE FROM runner_runs WHERE project_root = ? AND id = ?');
   for (const runId of runIds) {
      changes += remove.run(resolved, runId).changes as number;
   }
   return changes;
}

/** Deletes finished run rows, keeping the newest `keep` (never the active run). */
export function pruneRuns(
   db: DatabaseSync,
   projectRoot: string,
   keep: number,
   activeRunId?: string | null
): number {
   return db
      .prepare(
         `DELETE FROM runner_runs
          WHERE project_root = ?
            AND id != COALESCE(?, '')
            AND id NOT IN (
               SELECT id FROM runner_runs WHERE project_root = ?
               ORDER BY started_at DESC LIMIT ?
            )`
      )
      .run(path.resolve(projectRoot), activeRunId ?? null, path.resolve(projectRoot), keep)
      .changes as number;
}

// --- Locks -------------------------------------------------------------------

export interface RunnerLockRow {
   projectRoot: string;
   runId: string;
   pid: number | null;
   status: string;
   createdAt: string;
   updatedAt: string;
   expiresAt: string | null;
}

export function acquireLock(
   db: DatabaseSync,
   projectRoot: string,
   input: { runId: string; pid: number | null; expiresAt?: string | null }
): void {
   const now = new Date().toISOString();
   db.prepare(
      `INSERT INTO runner_locks (project_root, run_id, pid, status, created_at, updated_at, expires_at)
       VALUES (?, ?, ?, 'running', ?, ?, ?)
       ON CONFLICT (project_root) DO UPDATE SET
         run_id = excluded.run_id,
         pid = excluded.pid,
         status = excluded.status,
         updated_at = excluded.updated_at,
         expires_at = excluded.expires_at`
   ).run(path.resolve(projectRoot), input.runId, input.pid, now, now, input.expiresAt ?? null);
}

export function releaseLock(db: DatabaseSync, projectRoot: string): void {
   db.prepare('DELETE FROM runner_locks WHERE project_root = ?').run(path.resolve(projectRoot));
}

export function getLock(db: DatabaseSync, projectRoot: string): RunnerLockRow | null {
   const row = db
      .prepare('SELECT * FROM runner_locks WHERE project_root = ?')
      .get(path.resolve(projectRoot)) as unknown as
      | {
           project_root: string;
           run_id: string;
           pid: number | null;
           status: string;
           created_at: string;
           updated_at: string;
           expires_at: string | null;
        }
      | undefined;
   if (!row) return null;
   return {
      projectRoot: row.project_root,
      runId: row.run_id,
      pid: row.pid,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
   };
}

// --- Log metadata index --------------------------------------------------------

/** Records log file metadata for a run (full logs stay on disk). */
export function upsertLogIndex(
   db: DatabaseSync,
   input: { runId: string; logFile: string; sizeBytes: number; lineCount?: number | null }
): void {
   const now = new Date().toISOString();
   db.prepare(
      `INSERT INTO runner_log_index (id, run_id, log_file, size_bytes, line_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (run_id) DO UPDATE SET
         log_file = excluded.log_file,
         size_bytes = excluded.size_bytes,
         line_count = excluded.line_count,
         updated_at = excluded.updated_at`
   ).run(
      crypto.randomUUID(),
      input.runId,
      input.logFile,
      input.sizeBytes,
      input.lineCount ?? null,
      now,
      now
   );
}

export function getLogIndex(
   db: DatabaseSync,
   runId: string
): { runId: string; logFile: string; sizeBytes: number; lineCount: number | null } | null {
   const row = db
      .prepare('SELECT run_id, log_file, size_bytes, line_count FROM runner_log_index WHERE run_id = ?')
      .get(runId) as unknown as
      | { run_id: string; log_file: string; size_bytes: number; line_count: number | null }
      | undefined;
   if (!row) return null;
   return {
      runId: row.run_id,
      logFile: row.log_file,
      sizeBytes: row.size_bytes,
      lineCount: row.line_count,
   };
}
