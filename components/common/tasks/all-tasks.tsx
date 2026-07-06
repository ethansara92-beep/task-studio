'use client';

import { useCurrentTagWithTasks, useTasksByTag } from '@/hooks/use-taskmaster-queries';
import { useAllTasks } from '@/hooks/use-all-tasks';
import { TaskmasterTask } from '@/types/taskmaster';
import { createTagFromData } from '@/lib/tags';
import { useQueryState } from 'nuqs';
import { Priority } from '@/lib/priorities';
import { TASKMASTER_STATUSES, TASKMASTER_STATUS_MAP } from '@/lib/taskmaster-constants';
import { User } from '@/lib/users';
import { useSearchStore } from '@/store/search-store';
import { useFilterStore } from '@/store/filter-store';
import { FC, useMemo } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { formatTaskIdentifier } from '@/lib/format-task-id';
import { GroupTasks } from './group-tasks';
import { TaskWithSubtasks } from './task-with-subtasks';
import { CustomDragLayer } from './task-grid';
import { TaskSourceBanner } from './task-source-banner';
import { TaskLoadErrorState, TasksEmptyState } from './task-load-error';
import { cn } from '@/lib/utils';
import { Task } from '@/lib/task-view';

// Generate tag prefix from tag name
function getTagPrefix(tagName: string): string {
   // Split by hyphens or spaces
   const words = tagName.split(/[-\s]+/);

   if (words.length > 1) {
      // Use first letter of each word
      return words.map((word) => word.charAt(0).toUpperCase()).join('');
   } else {
      // Single word: use first 2 letters
      return tagName.substring(0, 2).toUpperCase();
   }
}

// Convert Taskmaster task to Task format for compatibility
function taskToTask(
   task: TaskmasterTask & { tagName?: string },
   tagMetadata?: { created?: string; updated?: string }
): Task {
   const statusInfo =
      TASKMASTER_STATUS_MAP[task.status as keyof typeof TASKMASTER_STATUS_MAP] ||
      TASKMASTER_STATUS_MAP.pending; // Default to pending if not found

   const tagPrefix =
      task.tagName && task.tagName !== 'master' ? getTagPrefix(task.tagName) : undefined;

   return {
      id: task.tagName ? `${task.tagName}-${task.id}` : task.id.toString(),
      identifier: formatTaskIdentifier(task.id, task.tagName, tagPrefix),
      title: task.title,
      description: task.description,
      status: {
         id: task.status === 'in-progress' ? 'in_progress' : task.status, // Normalize to underscore version
         name: statusInfo.name,
         color: statusInfo.color,
         icon: statusInfo.icon,
      },
      priority: {
         id: task.priority,
         name: task.priority.charAt(0).toUpperCase() + task.priority.slice(1),
      } as Priority,
      assignee: task.assignee
         ? ({
              id: task.assignee,
              name: task.assignee,
              email: `${task.assignee}@example.com`,
           } as User)
         : null,
      labels:
         task.labels?.map((label) => ({
            id: label,
            name: label,
            color: '#8B5CF6',
         })) || [],
      tag: task.tagName ? createTagFromData(task.tagName, 0, undefined, 0) : undefined,
      createdAt: tagMetadata?.created || new Date().toISOString(),
      cycleId: '1',
      rank: task.id.toString(),
      subtasks: task.subtasks, // Pass through subtasks
   };
}

export default function AllTasks({
   showAllTags = false,
   tagName,
}: {
   showAllTags?: boolean;
   tagName?: string;
}) {
   const { isSearchOpen, searchQuery } = useSearchStore();
   const { hasActiveFilters } = useFilterStore();
   const [viewType] = useQueryState('view', {
      defaultValue: 'list',
      parse: (value) => (value === 'board' || value === 'list' ? value : 'list'),
      history: 'push',
   });
   const [active] = useQueryState('active', {
      defaultValue: null,
      parse: (value) => (value === 'true' ? true : null),
      history: 'push',
   });
   const [taskFilter] = useQueryState('filter', {
      defaultValue: 'all',
      parse: (value) => (value === 'all' || value === 'active' ? value : 'all'),
      history: 'push',
   });

   // Use different hooks based on what we want to show
   const currentTagData = useCurrentTagWithTasks();
   const allTagsData = useAllTasks();
   const specificTagData = useTasksByTag(tagName || '');

   let isLoading: boolean;
   let error: any;
   let tasks: TaskmasterTask[];
   let metadata: { created?: string; updated?: string } | undefined;

   if (active) {
      // Show current tag when active=true
      isLoading = currentTagData.isLoading;
      error = currentTagData.error;
      const currentTag = currentTagData.currentTag;
      // Add tagName to each task for proper identifier generation
      tasks = currentTagData.tasks.map((task) => ({ ...task, tagName: currentTag }));
      metadata = currentTagData.metadata;
   } else if (showAllTags) {
      // Show all tags
      isLoading = allTagsData.isLoading;
      error = allTagsData.error;
      tasks = allTagsData.data?.allTasks || [];
      // For all tags view, we don't have a single metadata
      metadata = undefined;
   } else if (tagName) {
      // Show specific tag
      isLoading = specificTagData.isLoading;
      error = specificTagData.error;
      // Add tagName to each task for proper identifier generation
      tasks = (specificTagData.data?.tasks || []).map((task) => ({ ...task, tagName }));
      metadata = specificTagData.data?.metadata;
   } else {
      // Show current tag
      isLoading = currentTagData.isLoading;
      error = currentTagData.error;
      const currentTag = currentTagData.currentTag;
      // Add tagName to each task for proper identifier generation
      tasks = currentTagData.tasks.map((task) => ({ ...task, tagName: currentTag }));
      metadata = currentTagData.metadata;
   }

   // Apply task filter
   if (taskFilter === 'active') {
      tasks = tasks.filter((task) => task.status === 'in-progress' || task.status === 'pending');
   }

   const isSearching = isSearchOpen && searchQuery.trim() !== '';
   const isViewTypeBoard = viewType === 'board';
   const isFiltering = hasActiveFilters();

   if (isLoading) {
      return <div className="w-full h-full flex items-center justify-center">Loading tasks...</div>;
   }

   if (error) {
      return (
         <div className="w-full h-full flex flex-col">
            <TaskSourceBanner />
            <TaskLoadErrorState error={error} />
         </div>
      );
   }

   if (tasks.length === 0 && !isSearching && !isFiltering && taskFilter !== 'active') {
      return (
         <div className="w-full h-full flex flex-col">
            <TaskSourceBanner />
            <TasksEmptyState />
         </div>
      );
   }

   return (
      <div className="w-full h-full flex flex-col">
         <TaskSourceBanner />
         <div className={cn('w-full flex-1 min-h-0', isViewTypeBoard && 'overflow-x-auto')}>
            {isSearching ? (
               <SearchTasksView tasks={tasks} showAllTags={showAllTags} />
            ) : isFiltering ? (
               <FilteredTasksView
                  isViewTypeBoard={isViewTypeBoard}
                  tasks={tasks}
                  showAllTags={showAllTags}
               />
            ) : (
               <GroupTasksListView
                  isViewTypeBoard={isViewTypeBoard}
                  tasks={tasks}
                  showAllTags={showAllTags}
                  metadata={metadata}
               />
            )}
         </div>
      </div>
   );
}

const SearchTasksView: FC<{ tasks: TaskmasterTask[]; showAllTags?: boolean }> = ({
   tasks,
   showAllTags,
}) => {
   const { searchQuery } = useSearchStore();

   const searchResults = useMemo(() => {
      const query = searchQuery.toLowerCase();
      return tasks.filter(
         (task) =>
            task.title.toLowerCase().includes(query) ||
            task.description.toLowerCase().includes(query) ||
            task.id.toString().includes(query)
      );
   }, [tasks, searchQuery]);

   const tasksFormatted = searchResults.map((task) => taskToTask(task, (task as any).tagMetadata));

   return (
      <div className="px-6 mb-6">
         <div className="w-full">
            {searchQuery.trim() !== '' && (
               <div>
                  {tasksFormatted.length > 0 ? (
                     <div className="border rounded-md mt-4">
                        <div className="py-2 px-4 border-b bg-muted/50">
                           <h3 className="text-sm font-medium">
                              Results ({tasksFormatted.length})
                           </h3>
                        </div>
                        <div className="divide-y">
                           {tasksFormatted.map((task) => (
                              <TaskWithSubtasks
                                 key={task.id}
                                 task={task}
                                 layoutId={false}
                                 showTagBadge={showAllTags}
                              />
                           ))}
                        </div>
                     </div>
                  ) : (
                     <div className="text-center py-8 text-muted-foreground">
                        No results found for &quot;{searchQuery}&quot;
                     </div>
                  )}
               </div>
            )}
         </div>
      </div>
   );
};

const FilteredTasksView: FC<{
   isViewTypeBoard: boolean;
   tasks: TaskmasterTask[];
   showAllTags?: boolean;
}> = ({ isViewTypeBoard = false, tasks, showAllTags }) => {
   const { filters } = useFilterStore();

   // Apply filters to tasks
   const filteredTasks = useMemo(() => {
      let filtered = [...tasks];

      // Filter by status
      if (filters.status && filters.status.length > 0) {
         filtered = filtered.filter((task) => {
            // Normalize status for comparison
            const normalizedStatus = task.status === 'in-progress' ? 'in_progress' : task.status;
            return filters.status.includes(normalizedStatus);
         });
      }

      // Filter by priority
      if (filters.priority && filters.priority.length > 0) {
         filtered = filtered.filter((task) => filters.priority.includes(task.priority));
      }

      // Filter by assignee
      if (filters.assignee && filters.assignee.length > 0) {
         filtered = filtered.filter((task) => {
            if (filters.assignee.includes('unassigned')) {
               return !task.assignee;
            }
            return task.assignee && filters.assignee.includes(task.assignee);
         });
      }

      // Filter by labels
      if (filters.labels && filters.labels.length > 0) {
         filtered = filtered.filter((task) =>
            task.labels?.some((label: string) => filters.labels.includes(label))
         );
      }

      return filtered;
   }, [tasks, filters]);

   // Convert tasks to Task format
   const filteredTasksFormatted = filteredTasks.map((task) =>
      taskToTask(task, (task as any).tagMetadata)
   );

   // Group filtered tasks by status
   const filteredTasksByStatus = useMemo(() => {
      const result: Record<string, Task[]> = {};

      TASKMASTER_STATUSES.forEach((statusItem) => {
         result[statusItem.id] = filteredTasksFormatted.filter(
            (task) => task.status.id === statusItem.id
         );
      });

      return result;
   }, [filteredTasksFormatted]);

   return (
      <DndProvider backend={HTML5Backend}>
         <CustomDragLayer />
         <div className={cn(isViewTypeBoard && 'flex h-full gap-3 px-2 py-2 min-w-max')}>
            {TASKMASTER_STATUSES.map((statusItem) => (
               <GroupTasks
                  key={statusItem.id}
                  status={statusItem}
                  tasks={filteredTasksByStatus[statusItem.id] || []}
                  count={filteredTasksByStatus[statusItem.id]?.length || 0}
                  showTagBadge={showAllTags}
               />
            ))}
         </div>
      </DndProvider>
   );
};

const GroupTasksListView: FC<{
   isViewTypeBoard: boolean;
   tasks: TaskmasterTask[];
   showAllTags?: boolean;
   metadata?: { created?: string; updated?: string };
}> = ({ isViewTypeBoard = false, tasks, showAllTags, metadata }) => {
   // Convert tasks to Task format and group by status
   const tasksByStatus = useMemo(() => {
      const tasksFormatted = tasks.map((task) => taskToTask(task, metadata));
      const result: Record<string, Task[]> = {};

      TASKMASTER_STATUSES.forEach((statusItem) => {
         result[statusItem.id] = tasksFormatted.filter((task) => task.status.id === statusItem.id);
      });

      return result;
   }, [tasks, metadata]);

   return (
      <DndProvider backend={HTML5Backend}>
         <CustomDragLayer />
         <div className={cn(isViewTypeBoard && 'flex h-full gap-3 px-2 py-2 min-w-max')}>
            {TASKMASTER_STATUSES.map((statusItem) => (
               <GroupTasks
                  key={statusItem.id}
                  status={statusItem}
                  tasks={tasksByStatus[statusItem.id] || []}
                  count={tasksByStatus[statusItem.id]?.length || 0}
                  showTagBadge={showAllTags}
               />
            ))}
         </div>
      </DndProvider>
   );
};
