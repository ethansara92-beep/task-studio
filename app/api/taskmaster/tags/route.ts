import { NextRequest, NextResponse } from 'next/server';
import { loadTaskmasterTasks } from '@/lib/taskmaster/load-tasks';
import { taskLoadErrorResponse } from '@/lib/taskmaster/api-helpers';

/**
 * GET /api/taskmaster/tags?projectRoot=...
 *
 * Lists tag contexts found in the active project's tasks.json.
 */
export async function GET(request: NextRequest) {
   try {
      const requestedRoot = request.nextUrl.searchParams.get('projectRoot');
      const loaded = await loadTaskmasterTasks(requestedRoot);

      const tags = Object.entries(loaded.tags).map(([name, context]) => ({
         name,
         taskCount: context.tasks.length,
         metadata: context.metadata,
      }));

      return NextResponse.json({
         success: true,
         data: tags,
         source: loaded.source,
         timestamp: new Date().toISOString(),
      });
   } catch (error) {
      return taskLoadErrorResponse(error);
   }
}
