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

const bodySchema = z.object({
   action: z.enum(['clear-run-history', 'clear-stale-lock', 'clear-audit-log']),
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
            detail = `Cleared run history (${removed} files)`;
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
            detail = 'Cleared stale runner lock';
            break;
         }
         case 'clear-audit-log': {
            await fs.unlink(getAuditLogPath()).catch(() => {});
            detail = 'Cleared audit log';
            break;
         }
      }

      await appendAuditLog('maintenance.performed', detail, {
         enabled: settings.security.auditLog,
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
