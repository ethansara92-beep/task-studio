import crypto from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from '@/lib/db';
import type { TaskStudioSettings } from '@/types/settings';

/**
 * Registry of configured Taskmaster project roots. A valid project root
 * contains `.taskmaster/tasks/tasks.json`. Rows are created from the server's
 * configured root (seeded at DB init), from Settings → Projects (synced on
 * save), and from the projects API.
 */

export interface ProjectRecord {
   id: string;
   name: string | null;
   rootPath: string;
   isDefault: boolean;
   isValid: boolean;
   validationStatus: string | null;
   validationError: string | null;
   createdAt: string;
   updatedAt: string;
   lastOpenedAt: string | null;
}

interface ProjectRow {
   id: string;
   name: string | null;
   root_path: string;
   is_default: number;
   is_valid: number;
   validation_status: string | null;
   validation_error: string | null;
   created_at: string;
   updated_at: string;
   last_opened_at: string | null;
}

function toRecord(row: ProjectRow): ProjectRecord {
   return {
      id: row.id,
      name: row.name,
      rootPath: row.root_path,
      isDefault: row.is_default === 1,
      isValid: row.is_valid === 1,
      validationStatus: row.validation_status,
      validationError: row.validation_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastOpenedAt: row.last_opened_at,
   };
}

export function listProjects(db: DatabaseSync): ProjectRecord[] {
   const rows = db
      .prepare('SELECT * FROM projects ORDER BY is_default DESC, root_path')
      .all() as unknown as ProjectRow[];
   return rows.map(toRecord);
}

export function getProjectById(db: DatabaseSync, id: string): ProjectRecord | null {
   const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as unknown as
      | ProjectRow
      | undefined;
   return row ? toRecord(row) : null;
}

export function getProjectByRoot(db: DatabaseSync, rootPath: string): ProjectRecord | null {
   const row = db
      .prepare('SELECT * FROM projects WHERE root_path = ?')
      .get(path.resolve(rootPath)) as unknown as ProjectRow | undefined;
   return row ? toRecord(row) : null;
}

export interface ProjectValidationResult {
   ok: boolean;
   error?: string;
}

/** A valid project root must contain `.taskmaster/tasks/tasks.json`. */
export async function validateProjectRootOnDisk(rootPath: string): Promise<ProjectValidationResult> {
   const tasksJson = path.join(path.resolve(rootPath), '.taskmaster', 'tasks', 'tasks.json');
   try {
      await fs.access(tasksJson);
      return { ok: true };
   } catch {
      return { ok: false, error: 'No .taskmaster/tasks/tasks.json found under this root' };
   }
}

/** Inserts a project (validating on disk) or refreshes it if the root exists. */
export async function addProject(
   db: DatabaseSync,
   input: { rootPath: string; name?: string | null }
): Promise<ProjectRecord> {
   const rootPath = path.resolve(input.rootPath);
   const validation = await validateProjectRootOnDisk(rootPath);
   const now = new Date().toISOString();

   db.prepare(
      `INSERT INTO projects
         (id, name, root_path, is_default, is_valid, validation_status, validation_error, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)
       ON CONFLICT (root_path) DO UPDATE SET
         name = COALESCE(excluded.name, projects.name),
         is_valid = excluded.is_valid,
         validation_status = excluded.validation_status,
         validation_error = excluded.validation_error,
         updated_at = excluded.updated_at`
   ).run(
      crypto.randomUUID(),
      input.name ?? path.basename(rootPath),
      rootPath,
      validation.ok ? 1 : 0,
      validation.ok ? 'valid' : 'invalid',
      validation.error ?? null,
      now,
      now
   );

   const record = getProjectByRoot(db, rootPath);
   if (!record) throw new Error('Failed to persist project');
   return record;
}

export function removeProject(db: DatabaseSync, id: string): boolean {
   const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
   return result.changes > 0;
}

/** Marks one project as default and clears the flag everywhere else. */
export function setDefaultProject(db: DatabaseSync, id: string): ProjectRecord | null {
   return withTransaction(db, () => {
      const now = new Date().toISOString();
      db.prepare('UPDATE projects SET is_default = 0, updated_at = ? WHERE is_default = 1').run(now);
      db.prepare('UPDATE projects SET is_default = 1, updated_at = ? WHERE id = ?').run(now, id);
      return getProjectById(db, id);
   });
}

export function touchLastOpened(db: DatabaseSync, rootPath: string): void {
   const now = new Date().toISOString();
   db.prepare('UPDATE projects SET last_opened_at = ?, updated_at = ? WHERE root_path = ?').run(
      now,
      now,
      path.resolve(rootPath)
   );
}

/** Re-validates a stored project against the filesystem and persists the result. */
export async function revalidateProject(
   db: DatabaseSync,
   id: string
): Promise<ProjectRecord | null> {
   const project = getProjectById(db, id);
   if (!project) return null;

   const validation = await validateProjectRootOnDisk(project.rootPath);
   const now = new Date().toISOString();
   db.prepare(
      `UPDATE projects
       SET is_valid = ?, validation_status = ?, validation_error = ?, updated_at = ?
       WHERE id = ?`
   ).run(
      validation.ok ? 1 : 0,
      validation.ok ? 'valid' : 'invalid',
      validation.error ?? null,
      now,
      id
   );
   return getProjectById(db, id);
}

/**
 * Mirrors project roots configured in Settings → Projects into the registry.
 * Upsert-only: rows added through the API or seeding are never deleted here.
 */
export function syncProjectsFromSettings(db: DatabaseSync, settings: TaskStudioSettings): void {
   const now = new Date().toISOString();
   const upsert = db.prepare(
      `INSERT INTO projects (id, name, root_path, is_default, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)
       ON CONFLICT (root_path) DO UPDATE SET updated_at = excluded.updated_at`
   );

   withTransaction(db, () => {
      for (const project of settings.projects.items) {
         const rootPath = path.resolve(project.root);
         upsert.run(crypto.randomUUID(), path.basename(rootPath), rootPath, now, now);
      }
      const defaultRoot = settings.projects.defaultRoot ?? settings.general.defaultProjectRoot;
      if (defaultRoot) {
         const existing = getProjectByRoot(db, defaultRoot);
         if (existing && !existing.isDefault) {
            db.prepare('UPDATE projects SET is_default = 0 WHERE is_default = 1').run();
            db.prepare('UPDATE projects SET is_default = 1, updated_at = ? WHERE id = ?').run(
               now,
               existing.id
            );
         }
      }
   });
}
