import { NextRequest, NextResponse } from 'next/server';
import { loadTaskmasterTasks } from '@/lib/taskmaster/load-tasks';
import { mergeComplexityIntoTasks } from '@/lib/taskmaster/complexity-reports';
import { taskLoadErrorResponse } from '@/lib/taskmaster/api-helpers';

/**
 * GET /api/taskmaster/tasks?projectRoot=...
 *
 * Returns the full tagged task document read from the active project's
 * `.taskmaster/tasks/tasks.json` (canonical source). Errors are returned with
 * machine-readable codes - there is no mock/demo fallback.
 */
export async function GET(request: NextRequest) {
   try {
      const requestedRoot = request.nextUrl.searchParams.get('projectRoot');
      const loaded = await loadTaskmasterTasks(requestedRoot);

      const data: Record<string, { tasks: unknown[]; metadata: unknown }> = {};
      for (const [tagName, context] of Object.entries(loaded.tags)) {
         data[tagName] = {
            tasks: await mergeComplexityIntoTasks(
               loaded.source.projectRoot,
               tagName,
               context.tasks
            ),
            metadata: context.metadata,
         };
      }

      return NextResponse.json(
         {
            success: true,
            data,
            source: loaded.source,
            timestamp: new Date().toISOString(),
         },
         {
            headers: {
               'Cache-Control': 'no-store, no-cache, must-revalidate',
            },
         }
      );
   } catch (error) {
      return taskLoadErrorResponse(error);
   }
}
