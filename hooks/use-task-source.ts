'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchTaskSource, refreshTaskCacheApi, unwrapApiResponse } from '@/lib/api/taskmaster';
import { taskmasterKeys } from './use-taskmaster-queries';

/**
 * Diagnostics about the active task source (project root, tasks file path,
 * parse/cache state). Lives under the shared 'taskmaster' query key so the
 * file watcher's invalidations refresh it too.
 */
export function useTaskSource() {
   return useQuery({
      queryKey: [...taskmasterKeys.all, 'source'],
      queryFn: async () => {
         const result = await fetchTaskSource();
         return unwrapApiResponse(result, 'Failed to fetch task source');
      },
   });
}

/** Re-fetches every task query from the canonical tasks file. */
export function useRefreshTasks() {
   const queryClient = useQueryClient();
   return () => queryClient.invalidateQueries({ queryKey: taskmasterKeys.all });
}

/** Forces a rebuild of the SQLite task_cache from tasks.json. */
export function useRefreshTaskCache() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: async () => {
         const result = await refreshTaskCacheApi();
         return unwrapApiResponse(result, 'Failed to refresh task cache');
      },
      onSuccess: (data: { taskCount?: number }) => {
         toast.success(
            typeof data?.taskCount === 'number'
               ? `Task cache refreshed (${data.taskCount} tasks)`
               : 'Task cache refreshed'
         );
         queryClient.invalidateQueries({ queryKey: taskmasterKeys.all });
      },
      onError: (error) => {
         toast.error(error instanceof Error ? error.message : 'Failed to refresh task cache');
      },
   });
}
