import { NextResponse } from 'next/server';
import path from 'node:path';
import { getSettingsFilePath, loadSettings } from '@/lib/settings/settings-service';
import { validateBinary } from '@/lib/settings/validate-tools';
import { describeTasksFile, resolveActiveProjectRoot } from '@/lib/taskmaster/project-root';
import { getDbStatus, tryGetDb } from '@/lib/db';
import { countCachedTasks, getCachedMtimeMs } from '@/lib/db/repositories/task-cache-repository';
import packageJson from '@/package.json';

export async function GET() {
   try {
      const settings = await loadSettings();
      const projectRoot = await resolveActiveProjectRoot();
      const tasksFile = await describeTasksFile(projectRoot);

      const [tm, claude] = await Promise.all([
         validateBinary(settings.taskmaster.tmPath),
         validateBinary(settings.claude.claudePath),
      ]);

      let cachedTaskCount: number | null = null;
      let cachedMtimeMs: number | null = null;
      try {
         const db = tryGetDb();
         if (db) {
            cachedTaskCount = countCachedTasks(db, projectRoot);
            cachedMtimeMs = getCachedMtimeMs(db, projectRoot);
         }
      } catch {
         // Cache diagnostics are best-effort.
      }

      return NextResponse.json({
         success: true,
         data: {
            appVersion: packageJson.version,
            nodeVersion: process.version,
            platform: `${process.platform} ${process.arch}`,
            projectRoot,
            settingsFilePath: getSettingsFilePath(),
            tasksFilePath: tasksFile.path,
            tasksFile: {
               exists: tasksFile.exists,
               mtimeMs: tasksFile.mtimeMs,
               sizeBytes: tasksFile.sizeBytes,
            },
            taskCache: {
               cachedTaskCount,
               cachedMtimeMs,
               inSync:
                  tasksFile.exists && cachedMtimeMs !== null
                     ? cachedMtimeMs === tasksFile.mtimeMs
                     : null,
            },
            runsDirPath: path.join(projectRoot, '.taskmaster', 'runs'),
            taskmaster: { path: settings.taskmaster.tmPath, ...tm },
            claude: { path: settings.claude.claudePath, ...claude },
            database: getDbStatus(),
         },
         timestamp: new Date().toISOString(),
      });
   } catch (error) {
      return NextResponse.json(
         {
            success: false,
            error: error instanceof Error ? error.message : 'Diagnostics failed',
            timestamp: new Date().toISOString(),
         },
         { status: 500 }
      );
   }
}
