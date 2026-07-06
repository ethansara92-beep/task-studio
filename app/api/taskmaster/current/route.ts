import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';
import { resolveActiveProjectRoot } from '@/lib/taskmaster/project-root';
import { taskLoadErrorResponse } from '@/lib/taskmaster/api-helpers';
import { TaskLoadError } from '@/lib/taskmaster/parse-taskmaster-tasks';

/**
 * GET /api/taskmaster/current?projectRoot=...
 *
 * Returns the current tag context from the active project's state.json.
 * A missing state.json is not an error - Taskmaster defaults to 'master' -
 * but a corrupt one is reported instead of silently masked.
 */
export async function GET(request: NextRequest) {
   try {
      const requestedRoot = request.nextUrl.searchParams.get('projectRoot');
      const projectRoot = await resolveActiveProjectRoot(requestedRoot);
      const statePath = path.join(projectRoot, '.taskmaster', 'state.json');

      let state: Record<string, unknown> | null = null;
      let raw: string | null = null;
      try {
         raw = await fs.readFile(statePath, 'utf-8');
      } catch {
         // No state.json yet: fall back to the default tag.
      }

      if (raw !== null) {
         try {
            state = JSON.parse(raw);
         } catch (error) {
            throw new TaskLoadError(
               'INVALID_JSON',
               `Failed to parse state.json: ${error instanceof Error ? error.message : 'invalid JSON'}`,
               422
            );
         }
      }

      return NextResponse.json({
         success: true,
         data: {
            currentTag: (state?.currentTag as string) || 'master',
            state,
         },
         source: { projectRoot, statePath },
         timestamp: new Date().toISOString(),
      });
   } catch (error) {
      return taskLoadErrorResponse(error);
   }
}
