import { useQuery } from '@tanstack/react-query';
import { fetchTags, fetchTasksByTag, TaskmasterApiError } from '@/lib/api/taskmaster';
import { TaskmasterTask } from '@/types/taskmaster';
import { taskmasterKeys } from './use-taskmaster-queries';

// Extended task type that includes tag information
export interface TaskWithTag extends TaskmasterTask {
   tagName: string;
   tagMetadata?: {
      created?: string;
      updated?: string;
      description?: string;
   };
}

// Hook to fetch all tasks from all tags
export function useAllTasks() {
   return useQuery({
      queryKey: [...taskmasterKeys.all, 'allTasks'],
      queryFn: async () => {
         // First, fetch all tags
         const tagsResult = await fetchTags();
         if (!tagsResult.success) {
            throw new TaskmasterApiError(
               tagsResult.error || 'Failed to fetch tags',
               tagsResult.code
            );
         }

         // Then, fetch tasks for each tag
         const allTasks: TaskWithTag[] = [];
         const tasksByTag: Record<string, TaskWithTag[]> = {};
         const metadataByTag: Record<string, any> = {};

         for (const tag of tagsResult.data || []) {
            const tasksResult = await fetchTasksByTag(tag.name);
            if (!tasksResult.success) {
               // Fail loudly: a partially-loaded view would silently hide tasks.
               throw new TaskmasterApiError(
                  tasksResult.error || `Failed to fetch tasks for tag '${tag.name}'`,
                  tasksResult.code
               );
            }
            const tasksWithTag = (tasksResult.data?.tasks || []).map((task) => ({
               ...task,
               tagName: tag.name, // Add tag name to task for reference
               tagMetadata: tasksResult.data?.metadata, // Add tag metadata
            }));
            allTasks.push(...tasksWithTag);
            tasksByTag[tag.name] = tasksWithTag;
            metadataByTag[tag.name] = tasksResult.data?.metadata;
         }

         return {
            allTasks,
            tasksByTag,
            tags: tagsResult.data || [],
            metadataByTag,
         };
      },
   });
}
