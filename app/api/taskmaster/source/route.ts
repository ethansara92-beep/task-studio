import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { tryGetDb } from '@/lib/db';
import { countCachedTasks, getCachedMtimeMs } from '@/lib/db/repositories/task-cache-repository';
import { loadSettings } from '@/lib/settings/settings-service';
import {
   describeTasksFile,
   getEnvProjectRoot,
   resolveActiveProjectRoot,
} from '@/lib/taskmaster/project-root';
import { countTasks, extractTagContexts } from '@/lib/taskmaster/parse-taskmaster-tasks';
import { taskLoadErrorResponse } from '@/lib/taskmaster/api-helpers';

/**
 * GET /api/taskmaster/source?projectRoot=...
 *
 * Diagnostics for the active task source: which project root is active, where
 * the canonical tasks file is expected, whether it exists/parses, and how the
 * SQLite task_cache index compares. Used by the tasks page banner and the
 * Developer settings panel.
 */
export async function GET(request: NextRequest) {
   try {
      const requestedRoot = request.nextUrl.searchParams.get('projectRoot');
      const projectRoot = await resolveActiveProjectRoot(requestedRoot);
      const file = await describeTasksFile(projectRoot);

      let parsedTaskCount: number | null = null;
      let tagCount: number | null = null;
      let parseError: string | null = null;
      if (file.exists) {
         try {
            const raw = await fs.readFile(file.path, 'utf-8');
            const tags = extractTagContexts(JSON.parse(raw));
            parsedTaskCount = countTasks(tags);
            tagCount = Object.keys(tags).length;
         } catch (error) {
            parseError = error instanceof Error ? error.message : 'Failed to parse tasks.json';
         }
      }

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

      let defaultProjectRoot: string | null = null;
      let projectRootAllowlist: string[] = [];
      try {
         const settings = await loadSettings();
         defaultProjectRoot = settings.general.defaultProjectRoot;
         projectRootAllowlist = settings.general.projectRootAllowlist;
      } catch {
         // Settings are informational here.
      }

      return NextResponse.json({
         success: true,
         data: {
            projectRoot,
            envProjectRoot: getEnvProjectRoot(),
            defaultProjectRoot,
            projectRootAllowlist,
            tasksFilePath: file.path,
            fileExists: file.exists,
            fileMtimeMs: file.mtimeMs,
            fileSizeBytes: file.sizeBytes,
            parsedTaskCount,
            tagCount,
            parseError,
            cachedTaskCount,
            cachedMtimeMs,
            cacheInSync:
               file.exists && cachedMtimeMs !== null ? cachedMtimeMs === file.mtimeMs : null,
         },
         timestamp: new Date().toISOString(),
      });
   } catch (error) {
      return taskLoadErrorResponse(error);
   }
}
