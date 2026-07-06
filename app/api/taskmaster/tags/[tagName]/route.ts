import { NextRequest, NextResponse } from 'next/server';
import { loadTaskmasterTasks } from '@/lib/taskmaster/load-tasks';
import { mergeComplexityIntoTasks } from '@/lib/taskmaster/complexity-reports';
import { taskLoadErrorResponse } from '@/lib/taskmaster/api-helpers';
import { TaskLoadError } from '@/lib/taskmaster/parse-taskmaster-tasks';

interface RouteParams {
   params: Promise<{
      tagName: string;
   }>;
}

/**
 * GET /api/taskmaster/tags/[tagName]?projectRoot=...
 *
 * Returns the tasks of one tag context from the active project's tasks.json,
 * enriched with the tag's complexity report when one exists.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
   try {
      const { tagName } = await params;
      const requestedRoot = request.nextUrl.searchParams.get('projectRoot');
      const loaded = await loadTaskmasterTasks(requestedRoot);

      const tagContext = loaded.tags[tagName];
      if (!tagContext) {
         throw new TaskLoadError('TAG_NOT_FOUND', `Tag '${tagName}' not found`, 404);
      }

      const tasks = await mergeComplexityIntoTasks(
         loaded.source.projectRoot,
         tagName,
         tagContext.tasks
      );

      return NextResponse.json(
         {
            success: true,
            data: {
               name: tagName,
               tasks,
               metadata: tagContext.metadata,
            },
            source: loaded.source,
            timestamp: new Date().toISOString(),
         },
         {
            headers: {
               'Cache-Control': 'no-store, no-cache, must-revalidate',
               'Pragma': 'no-cache',
               'Expires': '0',
            },
         }
      );
   } catch (error) {
      return taskLoadErrorResponse(error);
   }
}
