import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

/** In-app notification history (runner events, file changes, etc.). */

export interface NotificationRecord {
   id: string;
   type: string;
   title: string;
   message: string | null;
   status: 'unread' | 'read';
   readAt: string | null;
   metadata: unknown;
   createdAt: string;
}

interface NotificationRow {
   id: string;
   type: string;
   title: string;
   message: string | null;
   status: string;
   read_at: string | null;
   metadata_json: string | null;
   created_at: string;
}

function toRecord(row: NotificationRow): NotificationRecord {
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
      type: row.type,
      title: row.title,
      message: row.message,
      status: row.status === 'read' ? 'read' : 'unread',
      readAt: row.read_at,
      metadata,
      createdAt: row.created_at,
   };
}

export function addNotification(
   db: DatabaseSync,
   input: { type: string; title: string; message?: string | null; metadata?: unknown }
): NotificationRecord {
   const id = crypto.randomUUID();
   const now = new Date().toISOString();
   db.prepare(
      `INSERT INTO notifications (id, type, title, message, status, metadata_json, created_at)
       VALUES (?, ?, ?, ?, 'unread', ?, ?)`
   ).run(
      id,
      input.type,
      input.title,
      input.message ?? null,
      input.metadata === undefined ? null : JSON.stringify(input.metadata),
      now
   );
   return {
      id,
      type: input.type,
      title: input.title,
      message: input.message ?? null,
      status: 'unread',
      readAt: null,
      metadata: input.metadata ?? null,
      createdAt: now,
   };
}

export function listNotifications(
   db: DatabaseSync,
   options: { limit?: number; unreadOnly?: boolean } = {}
): NotificationRecord[] {
   const limit = Math.min(Math.max(1, options.limit ?? 50), 500);
   const rows = (
      options.unreadOnly
         ? db.prepare(
              `SELECT * FROM notifications WHERE status = 'unread' ORDER BY created_at DESC LIMIT ?`
           )
         : db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?')
   ).all(limit) as unknown as NotificationRow[];
   return rows.map(toRecord);
}

export function markNotificationRead(db: DatabaseSync, id: string): boolean {
   const result = db
      .prepare(`UPDATE notifications SET status = 'read', read_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);
   return (result.changes as number) > 0;
}

/** Deletes notifications; with `olderThanIso` only those created before it. */
export function clearNotifications(db: DatabaseSync, olderThanIso?: string): number {
   const result = olderThanIso
      ? db.prepare('DELETE FROM notifications WHERE created_at < ?').run(olderThanIso)
      : db.prepare('DELETE FROM notifications').run();
   return result.changes as number;
}
