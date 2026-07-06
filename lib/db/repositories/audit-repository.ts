import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Local audit history. Only event names and non-sensitive context are
 * recorded - never setting values, secrets, or log content.
 */

export interface AuditEventInput {
   eventType: string;
   actor?: string | null;
   projectRoot?: string | null;
   taskId?: string | null;
   runId?: string | null;
   message?: string | null;
   metadata?: unknown;
}

export interface AuditEventRecord {
   id: string;
   eventType: string;
   actor: string | null;
   projectRoot: string | null;
   taskId: string | null;
   runId: string | null;
   message: string | null;
   metadata: unknown;
   createdAt: string;
}

export function addAuditEvent(db: DatabaseSync, input: AuditEventInput): void {
   db.prepare(
      `INSERT INTO audit_events
         (id, event_type, actor, project_root, task_id, run_id, message, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
   ).run(
      crypto.randomUUID(),
      input.eventType,
      input.actor ?? 'local-user',
      input.projectRoot ?? null,
      input.taskId ?? null,
      input.runId ?? null,
      input.message ?? null,
      input.metadata === undefined ? null : JSON.stringify(input.metadata),
      new Date().toISOString()
   );
}

export function listAuditEvents(db: DatabaseSync, limit = 100): AuditEventRecord[] {
   const rows = db
      .prepare('SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?')
      .all(Math.min(Math.max(1, limit), 1000)) as unknown as Array<{
      id: string;
      event_type: string;
      actor: string | null;
      project_root: string | null;
      task_id: string | null;
      run_id: string | null;
      message: string | null;
      metadata_json: string | null;
      created_at: string;
   }>;
   return rows.map((row) => {
      let metadata: unknown = null;
      if (row.metadata_json) {
         try {
            metadata = JSON.parse(row.metadata_json);
         } catch {
            // Metadata is best-effort.
         }
      }
      return {
         id: row.id,
         eventType: row.event_type,
         actor: row.actor,
         projectRoot: row.project_root,
         taskId: row.task_id,
         runId: row.run_id,
         message: row.message,
         metadata,
         createdAt: row.created_at,
      };
   });
}

export function clearAuditEvents(db: DatabaseSync): number {
   return db.prepare('DELETE FROM audit_events').run().changes as number;
}
