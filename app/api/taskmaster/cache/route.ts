import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import {
   getCachedTasks,
   refreshTaskCache,
   refreshTaskCacheIfStale,
} from '@/lib/db/repositories/task-cache-repository';
import { getConfiguredProjectRoot } from '@/lib/runner/runner-validation';

/**
 * Read-through task cache/index. `.taskmaster/tasks/tasks.json` stays
 * canonical: GET refreshes the cache when the file's mtime changed, POST
 * forces a rebuild. Nothing here ever writes back to Taskmaster files.
 */

const querySchema = z.object({
   tag: z.string().max(100).optional(),
   status: z.string().max(50).optional(),
   priority: z.string().max(50).optional(),
   label: z.string().max(50).optional(),
   q: z.string().max(200).optional(),
   limit: z.coerce.number().int().min(1).max(2000).optional(),
});

function errorResponse(error: unknown, fallback: string, status = 500) {
   return NextResponse.json(
      {
         success: false,
         error: error instanceof Error ? error.message : fallback,
         timestamp: new Date().toISOString(),
      },
      { status }
   );
}

export async function GET(request: NextRequest) {
   try {
      const params = Object.fromEntries(request.nextUrl.searchParams.entries());
      const query = querySchema.safeParse(params);
      if (!query.success) {
         return errorResponse(new Error('Invalid cache query'), 'Invalid cache query', 400);
      }

      const db = getDb();
      const projectRoot = getConfiguredProjectRoot();
      const refresh = await refreshTaskCacheIfStale(db, projectRoot);
      const tasks = getCachedTasks(db, projectRoot, {
         tag: query.data.tag,
         status: query.data.status,
         priority: query.data.priority,
         label: query.data.label,
         search: query.data.q,
         limit: query.data.limit,
      });

      return NextResponse.json({
         success: true,
         data: {
            tasks,
            cache: {
               refreshed: refresh.refreshed,
               taskCount: refresh.taskCount,
               sourceMtimeMs: refresh.sourceMtimeMs,
               error: refresh.error,
            },
         },
         timestamp: new Date().toISOString(),
      });
   } catch (error) {
      return errorResponse(error, 'Failed to read task cache');
   }
}

export async function POST() {
   try {
      const db = getDb();
      const projectRoot = getConfiguredProjectRoot();
      const result = await refreshTaskCache(db, projectRoot);

      return NextResponse.json({
         success: result.error === undefined,
         data: result,
         error: result.error,
         timestamp: new Date().toISOString(),
      });
   } catch (error) {
      return errorResponse(error, 'Failed to refresh task cache');
   }
}
