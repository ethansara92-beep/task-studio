import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
   fetchTags,
   fetchTasksByTag,
   fetchCurrentTag,
   fetchState,
   fetchConfig,
   updateTask,
   unwrapApiResponse,
} from '@/lib/api/taskmaster';
import { TaskmasterTask, TaskStatus, TaskPriority } from '@/types/taskmaster';
import { UpdateTaskRequest } from '@/types/taskmaster-api';
import { findTaskInTag, updateTaskInPlace, cloneTasks } from '@/lib/taskmaster-service';
import { toast } from 'sonner';

// Query keys
export const taskmasterKeys = {
   all: ['taskmaster'] as const,
   tags: () => [...taskmasterKeys.all, 'tags'] as const,
   currentTag: () => [...taskmasterKeys.all, 'currentTag'] as const,
   tasksByTag: (tag: string) => [...taskmasterKeys.all, 'tasks', tag] as const,
   state: () => [...taskmasterKeys.all, 'state'] as const,
   config: () => [...taskmasterKeys.all, 'config'] as const,
};

// Hook to fetch all tags
export function useTags() {
   return useQuery({
      queryKey: taskmasterKeys.tags(),
      queryFn: async () => {
         const result = await fetchTags();
         return unwrapApiResponse(result, 'Failed to fetch tags');
      },
   });
}

// Hook to fetch current tag context
export function useCurrentTag() {
   return useQuery({
      queryKey: taskmasterKeys.currentTag(),
      queryFn: async () => {
         const result = await fetchCurrentTag();
         return unwrapApiResponse(result, 'Failed to fetch current tag');
      },
   });
}

// Hook to fetch tasks by tag
export function useTasksByTag(tagName: string) {
   return useQuery({
      queryKey: taskmasterKeys.tasksByTag(tagName),
      queryFn: async () => {
         const result = await fetchTasksByTag(tagName);
         return unwrapApiResponse(result, 'Failed to fetch tasks');
      },
      enabled: !!tagName,
   });
}

// Hook to fetch state
export function useTaskmasterState() {
   return useQuery({
      queryKey: taskmasterKeys.state(),
      queryFn: async () => {
         const result = await fetchState();
         return unwrapApiResponse(result, 'Failed to fetch state');
      },
   });
}

// Combined hook for current tag with its tasks
export function useCurrentTagWithTasks() {
   const { data: currentTagData, isLoading: isLoadingTag, error: tagError } = useCurrentTag();
   const currentTag = currentTagData?.currentTag || 'master';

   const {
      data: tasksData,
      isLoading: isLoadingTasks,
      error: tasksError,
   } = useTasksByTag(currentTag);

   return {
      currentTag,
      tasks: tasksData?.tasks || [],
      metadata: tasksData?.metadata,
      isLoading: isLoadingTag || isLoadingTasks,
      error: tagError || tasksError,
   };
}

// Hook to get filtered tasks
export function useFilteredTasks(filters: {
   status?: string[];
   priority?: string[];
   assignee?: string[];
   labels?: string[];
   search?: string;
}) {
   const { tasks } = useCurrentTagWithTasks();

   let filtered = [...tasks];

   // Filter by status
   if (filters.status && filters.status.length > 0) {
      filtered = filtered.filter((task) => filters.status!.includes(task.status));
   }

   // Filter by priority
   if (filters.priority && filters.priority.length > 0) {
      filtered = filtered.filter((task) => filters.priority!.includes(task.priority));
   }

   // Filter by assignee
   if (filters.assignee && filters.assignee.length > 0) {
      filtered = filtered.filter((task) => {
         if (filters.assignee!.includes('unassigned')) {
            return !task.assignee;
         }
         return task.assignee && filters.assignee!.includes(task.assignee);
      });
   }

   // Filter by labels
   if (filters.labels && filters.labels.length > 0) {
      filtered = filtered.filter((task) =>
         task.labels?.some((label: string) => filters.labels!.includes(label))
      );
   }

   // Search filter
   if (filters.search && filters.search.trim()) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
         (task) =>
            task.title.toLowerCase().includes(searchLower) ||
            task.description.toLowerCase().includes(searchLower) ||
            task.details?.toLowerCase().includes(searchLower) ||
            task.id.toString().includes(searchLower)
      );
   }

   return filtered;
}

// Hook to fetch config
export function useConfig() {
   return useQuery({
      queryKey: taskmasterKeys.config(),
      queryFn: async () => {
         const result = await fetchConfig();
         return unwrapApiResponse(result, 'Failed to fetch config');
      },
   });
}

// Mutation hook to update a task
export function useUpdateTask() {
   const queryClient = useQueryClient();

   const mutation = useMutation({
      mutationFn: async (params: UpdateTaskRequest) => {
         const result = await updateTask(params);
         if (!result.success) {
            throw new Error(result.error || 'Failed to update task');
         }
         return result.data;
      },
      onMutate: async (params) => {
         // Cancel any outgoing refetches
         await queryClient.cancelQueries({ queryKey: taskmasterKeys.tasksByTag(params.tag) });

         // Snapshot the previous value
         const previousTasks = queryClient.getQueryData(taskmasterKeys.tasksByTag(params.tag));

         // Optimistically update the cache
         queryClient.setQueryData(taskmasterKeys.tasksByTag(params.tag), (old: any) => {
            if (!old || !old.tasks) return old;

            const clonedTasks = cloneTasks(old.tasks);
            const success = updateTaskInPlace(clonedTasks, params.taskId, params.updates);

            if (!success) return old;

            return {
               ...old,
               tasks: clonedTasks,
            };
         });

         // Return a context object with the snapshotted value
         return { previousTasks, tag: params.tag };
      },
      onError: (err, params, context) => {
         // If the mutation fails, use the context returned from onMutate to roll back
         if (context?.previousTasks) {
            queryClient.setQueryData(taskmasterKeys.tasksByTag(context.tag), context.previousTasks);
         }

         // Show error toast with specific messages
         let errorMessage = 'Failed to update task';

         if (err instanceof Error) {
            // Parse specific error types
            if (err.message.includes('Invalid status transition')) {
               errorMessage = err.message;
            } else if (err.message.includes('Cannot mark task as done')) {
               errorMessage = 'Cannot mark task as done - please complete all subtasks first';
            } else if (err.message.includes('not found')) {
               errorMessage = 'Task not found - it may have been deleted';
            } else if (err.message.includes('Failed to save')) {
               errorMessage = 'Unable to save changes - please try again';
            } else {
               errorMessage = err.message;
            }
         }

         toast.error(errorMessage, {
            action: {
               label: 'Retry',
               onClick: () => {
                  // Retry the mutation with the same params
                  mutation.mutate(params);
               },
            },
         });
      },
      onSuccess: (data, params) => {
         // Invalidate queries to ensure data is fresh
         queryClient.invalidateQueries({ queryKey: taskmasterKeys.tasksByTag(params.tag) });
         queryClient.invalidateQueries({ queryKey: taskmasterKeys.tags() });
      },
   });

   return mutation;
}
