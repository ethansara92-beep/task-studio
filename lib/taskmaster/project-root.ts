import path from 'path';
import { promises as fs } from 'fs';
import { getTaskmasterPath } from '@/lib/taskmaster-paths';
import { loadSettings } from '@/lib/settings/settings-service';
import { TaskLoadError } from './parse-taskmaster-tasks';

/**
 * Project root resolution for task loading.
 *
 * The active project root is resolved server-side, in this order:
 *
 * 1. An explicit `?projectRoot=` request parameter - only accepted when it is
 *    allowlisted (Settings → General → Project root allowlist) or equals the
 *    root the server was started in. Client input is never used to build
 *    paths unless it passes this check.
 * 2. Settings → General → Default project root.
 * 3. The root the server was started in (TASKMASTER_DIR / USER_CWD / cwd).
 *
 * Tasks are always read from `<projectRoot>/.taskmaster/tasks/tasks.json`.
 */

/** The project root the server process was started in (env/cwd based). */
export function getEnvProjectRoot(): string {
   // getTaskmasterPath() points at <projectRoot>/.taskmaster
   return path.dirname(path.resolve(getTaskmasterPath()));
}

export interface ProjectRootConfig {
   defaultProjectRoot: string | null;
   projectRootAllowlist: string[];
}

/**
 * Pure resolution logic (unit-testable). Throws
 * TaskLoadError('PROJECT_ROOT_NOT_ALLOWLISTED') for a requested root outside
 * the allowlist.
 */
export function resolveProjectRootFromConfig(
   config: ProjectRootConfig,
   envRoot: string,
   requested?: string | null
): string {
   const resolvedEnvRoot = path.resolve(envRoot);
   const allowed = new Set<string>([
      resolvedEnvRoot,
      ...config.projectRootAllowlist.map((root) => path.resolve(root)),
   ]);

   if (requested !== undefined && requested !== null && requested !== '') {
      const resolvedRequested = path.resolve(requested);
      if (!allowed.has(resolvedRequested)) {
         throw new TaskLoadError(
            'PROJECT_ROOT_NOT_ALLOWLISTED',
            `Project root is not allowlisted: ${requested}. Add it in Settings → General → Project root allowlist.`,
            403
         );
      }
      return resolvedRequested;
   }

   if (config.defaultProjectRoot) {
      return path.resolve(config.defaultProjectRoot);
   }

   return resolvedEnvRoot;
}

/**
 * Resolves the active project root using stored settings.
 * `requested` is an optional client-provided override (validated).
 */
export async function resolveActiveProjectRoot(requested?: string | null): Promise<string> {
   let config: ProjectRootConfig = { defaultProjectRoot: null, projectRootAllowlist: [] };
   try {
      const settings = await loadSettings();
      config = {
         defaultProjectRoot: settings.general.defaultProjectRoot,
         projectRootAllowlist: settings.general.projectRootAllowlist,
      };
   } catch {
      // Settings unavailable: fall back to the env-configured root.
   }
   return resolveProjectRootFromConfig(config, getEnvProjectRoot(), requested);
}

/** Canonical tasks file location for a project root. */
export function getTasksFilePath(projectRoot: string): string {
   return path.join(path.resolve(projectRoot), '.taskmaster', 'tasks', 'tasks.json');
}

export interface TasksFileInfo {
   path: string;
   exists: boolean;
   mtimeMs: number | null;
   sizeBytes: number | null;
}

/** Stat-level info about a project's tasks file (never throws). */
export async function describeTasksFile(projectRoot: string): Promise<TasksFileInfo> {
   const filePath = getTasksFilePath(projectRoot);
   try {
      const stat = await fs.stat(filePath);
      return {
         path: filePath,
         exists: true,
         mtimeMs: Math.floor(stat.mtimeMs),
         sizeBytes: stat.size,
      };
   } catch {
      return { path: filePath, exists: false, mtimeMs: null, sizeBytes: null };
   }
}
