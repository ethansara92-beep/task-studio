import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { appendAuditLog, getAuditLogPath, loadSettings } from '@/lib/settings/settings-service';
import {
   getLockFilePath,
   getRunsDir,
   getConfiguredProjectRoot,
} from '@/lib/runner/runner-validation';
import { getActiveRun, getRunnerStatus } from '@/lib/runner/taskmaster-runner';
import { getDb, getDbPath, getDbStatus, tryGetDb } from '@/lib/db';
import { getMigrationVersion } from '@/lib/db/migrations';
import { deleteRuns, releaseLock } from '@/lib/db/repositories/runner-runs-repository';
import { clearAuditEvents } from '@/lib/db/repositories/audit-repository';
import { clearNotifications } from '@/lib/db/repositories/notifications-repository';

const bodySchema = z.object({
   action: z.enum([
      'clear-run-history',
      'clear-stale-lock',
      'clear-audit-log',
      'clear-notifications',
      'init-db',
      'vacuum-db',
      'backup-db',
   ]),
});

export async function POST(request: NextRequest) {
   try {
      const body = bodySchema.safeParse(await request.json().catch(() => null));
      if (!body.success) {
         return NextResponse.json(
            {
               success: false,
               error: 'Unknown maintenance action',
               timestamp: new Date().toISOString(),
            },
            { status: 400 }
         );
      }

      const settings = await loadSettings();
      const projectRoot = getConfiguredProjectRoot();
      let detail = '';
      let auditEvent: Parameters<typeof appendAuditLog>[0] = 'maintenance.performed';

      switch (body.data.action) {
         case 'clear-run-history': {
            const runsDir = getRunsDir(projectRoot);
            const active = getActiveRun(projectRoot);
            let removed = 0;
            try {
               const entries = await fs.readdir(runsDir);
               for (const name of entries) {
                  // Never delete the active run's files.
                  if (active && name.startsWith(active.runId)) continue;
                  if (name.endsWith('.json') || name.endsWith('.log')) {
                     await fs.unlink(path.join(runsDir, name)).catch(() => {});
                     removed++;
                  }
               }
            } catch {
               // No runs directory yet.
            }
            let dbRemoved = 0;
            const db = tryGetDb();
            if (db) {
               // Delete all run rows for this project except the active run.
               const keep = active ? [active.runId] : [];
               const before = db
                  .prepare('SELECT id FROM runner_runs WHERE project_root = ?')
                  .all(path.resolve(projectRoot)) as unknown as Array<{ id: string }>;
               dbRemoved = deleteRuns(
                  db,
                  projectRoot,
                  before.map((r) => r.id).filter((id) => !keep.includes(id))
               );
            }
            detail = `Cleared run history (${removed} files, ${dbRemoved} database rows)`;
            break;
         }
         case 'clear-stale-lock': {
            const status = await getRunnerStatus(projectRoot);
            if (status.lock && !status.lock.stale) {
               return NextResponse.json(
                  {
                     success: false,
                     error: `Lock is held by a live process (pid ${status.lock.pid}) - stop the run instead`,
                     timestamp: new Date().toISOString(),
                  },
                  { status: 409 }
               );
            }
            await fs.unlink(getLockFilePath(projectRoot)).catch(() => {});
            const db = tryGetDb();
            if (db) releaseLock(db, projectRoot);
            detail = 'Cleared stale runner lock';
            auditEvent = 'runner.lock_cleared';
            break;
         }
         case 'clear-audit-log': {
            await fs.unlink(getAuditLogPath()).catch(() => {});
            const db = tryGetDb();
            let cleared = 0;
            if (db) cleared = clearAuditEvents(db);
            detail = `Cleared audit log (${cleared} events)`;
            break;
         }
         case 'clear-notifications': {
            const db = getDb();
            const cleared = clearNotifications(db);
            detail = `Cleared ${cleared} notifications`;
            break;
         }
         case 'init-db': {
            // Opening the database creates the file and applies pending migrations.
            const db = getDb();
            detail = `Database ready at ${getDbPath()} (migration version ${getMigrationVersion(db)})`;
            break;
         }
         case 'vacuum-db': {
            const db = getDb();
            db.exec('VACUUM');
            const status = getDbStatus();
            detail = `Database vacuumed (${status.sizeBytes ?? 0} bytes)`;
            break;
         }
         case 'backup-db': {
            const db = getDb();
            const backupsDir = path.join(path.dirname(getDbPath()), 'backups');
            await fs.mkdir(backupsDir, { recursive: true });
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(backupsDir, `task-studio-${stamp}.sqlite`);
            // VACUUM INTO produces a consistent snapshot even mid-WAL.
            db.prepare('VACUUM INTO ?').run(backupPath);
            detail = `Database backup written to ${backupPath}`;
            break;
         }
      }

      await appendAuditLog(auditEvent, detail, {
         enabled: settings.security.auditLog,
         projectRoot,
      });
      return NextResponse.json({
         success: true,
         data: { detail },
         timestamp: new Date().toISOString(),
      });
   } catch (error) {
      return NextResponse.json(
         {
            success: false,
            error: error instanceof Error ? error.message : 'Maintenance action failed',
            timestamp: new Date().toISOString(),
         },
         { status: 500 }
      );
   }
}
