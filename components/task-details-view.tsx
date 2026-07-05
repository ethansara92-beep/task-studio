'use client';

import * as React from 'react';
import { TaskmasterTask } from '@/types/taskmaster';
import { TaskWithTag } from '@/hooks/use-all-tasks';
import { TASKMASTER_STATUS_MAP } from '@/lib/taskmaster-constants';
import { priorities } from '@/mock-data/priorities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SubtaskProgress } from '@/components/common/tasks/subtask-progress';
import { StatusSelector } from '@/components/common/tasks/status-selector';
import { PrioritySelector } from '@/components/common/tasks/priority-selector';
import { AssigneeSelector } from '@/components/common/tasks/assignee-selector';
import { EstimateSelector } from '@/components/common/tasks/estimate-selector';
import { countSubtasks } from '@/lib/subtask-utils';
import { Status } from '@/mock-data/status';
import { Priority } from '@/mock-data/priorities';
import { User } from '@/mock-data/users';
import {
   Plus,
   ChevronRight,
   X,
   ChevronUp,
   ChevronDown,
   MoreHorizontal,
   Link,
   GitBranch,
} from 'lucide-react';
import { useTaskViewUrl } from '@/hooks/use-task-view-url';
import { extractTaskId } from '@/lib/task-id-utils';
import { RunnerPanel } from '@/components/runner/runner-panel';
import { useAllTasks } from '@/hooks/use-all-tasks';
import { useCurrentTagWithTasks } from '@/hooks/use-taskmaster-queries';
import { formatTaskId, formatSubtaskId, formatTaskIdentifier } from '@/lib/format-task-id';

interface TaskDetailsViewProps {
   task: TaskmasterTask | TaskWithTag;
}

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

export function TaskDetailsView({ task }: TaskDetailsViewProps) {
   const [isSubtasksExpanded, setIsSubtasksExpanded] = React.useState(true);
   const [isDependenciesExpanded, setIsDependenciesExpanded] = React.useState(true);
   const { openTask, closeTask } = useTaskViewUrl();

   // Get all tasks and current tag tasks
   const allTasksData = useAllTasks();
   const currentTagData = useCurrentTagWithTasks();

   const statusInfo =
      TASKMASTER_STATUS_MAP[task.status as keyof typeof TASKMASTER_STATUS_MAP] ||
      TASKMASTER_STATUS_MAP.pending;
   const priority = priorities.find((p) => p.id === task.priority) || priorities[3];

   // Count subtasks
   const subtaskCount = task.subtasks
      ? countSubtasks({ subtasks: task.subtasks } as any)
      : { completed: 0, total: 0 };

   // Get tag name if available
   const tagName = 'tagName' in task ? task.tagName : 'master';

   // Create a unique task ID for the selectors
   // For subtasks, we need to reconstruct the full path
   const taskId = React.useMemo(() => {
      // Check if this is a subtask that was loaded from the overlay
      if ('_isSubtask' in task && (task as any)._isSubtask && 'parentId' in task) {
         const parentId = (task as any).parentId;
         const tagPrefix = 'tagName' in task && task.tagName ? `${task.tagName}-` : '';
         return `${tagPrefix}${parentId}.${task.id}`;
      }

      // Regular task
      return 'tagName' in task ? `${task.tagName}-${task.id}` : task.id.toString();
   }, [task]);

   // Check if this is a subtask by looking at the taskId format
   const isSubtask = taskId.includes('.');

   // Find current task position in the list
   const { taskIndex, totalTasks, prevTaskId, nextTaskId } = React.useMemo(() => {
      // If this is a subtask, navigate through parent task and its subtasks
      if (isSubtask) {
         // Parse the parent task ID and find parent task
         const parentIdMatch = taskId.match(/^(.*?)(\d+)(\.\d+)+$/);
         if (!parentIdMatch)
            return { taskIndex: 0, totalTasks: 0, prevTaskId: null, nextTaskId: null };

         const parentPrefix = parentIdMatch[1]; // e.g., "user-auth-" or ""
         const parentNumericId = parseInt(parentIdMatch[2]);

         // Find parent task
         let parentTask: TaskmasterTask | TaskWithTag | null = null;
         let taskList: Array<TaskmasterTask | TaskWithTag> = [];

         // Get the appropriate task list based on context
         if ('tagName' in task && task.tagName) {
            taskList = allTasksData.data?.tasksByTag?.[task.tagName] || [];
         } else {
            taskList = currentTagData.tasks || [];
         }

         // Find parent task by numeric ID
         parentTask = taskList.find((t) => t.id === parentNumericId) || null;

         if (!parentTask) {
            return { taskIndex: 0, totalTasks: 0, prevTaskId: null, nextTaskId: null };
         }

         // For subtasks, navigate through parent + all its subtasks as a flat list
         const allTasksInParent: Array<{ id: string; title: string }> = [];

         // Add parent task first
         const parentId = parentPrefix + parentNumericId;
         allTasksInParent.push({ id: parentId, title: parentTask.title });

         // Add all subtasks recursively
         const addSubtasksToList = (subtasks: any[], parentPath: string) => {
            if (!subtasks) return;
            subtasks.forEach((st: any) => {
               const subtaskId = `${parentPath}.${st.id}`;
               allTasksInParent.push({ id: subtaskId, title: st.title });
               if (st.subtasks) {
                  addSubtasksToList(st.subtasks, subtaskId);
               }
            });
         };

         if (parentTask.subtasks) {
            addSubtasksToList(parentTask.subtasks, parentId);
         }

         // Find current task index in the flat list
         const currentIndex = allTasksInParent.findIndex((t) => t.id === taskId);

         return {
            taskIndex: currentIndex >= 0 ? currentIndex + 1 : 0,
            totalTasks: allTasksInParent.length,
            prevTaskId: currentIndex > 0 ? allTasksInParent[currentIndex - 1].id : null,
            nextTaskId:
               currentIndex >= 0 && currentIndex < allTasksInParent.length - 1
                  ? allTasksInParent[currentIndex + 1].id
                  : null,
         };
      }

      // For main tasks, navigate through the main task list
      let taskList: Array<TaskmasterTask | TaskWithTag> = [];

      // Get the appropriate task list based on whether we're showing all tags or a specific tag
      if ('tagName' in task && task.tagName) {
         // If task has tagName, get tasks from that specific tag
         taskList = allTasksData.data?.tasksByTag?.[task.tagName] || [];
      } else {
         // Otherwise use current tag tasks
         taskList = currentTagData.tasks || [];
      }

      // Find the index of the current task
      const index = taskList.findIndex((t) => t.id === task.id);

      return {
         taskIndex: index >= 0 ? index + 1 : 0,
         totalTasks: taskList.length,
         prevTaskId:
            index > 0
               ? 'tagName' in taskList[index - 1]
                  ? `${(taskList[index - 1] as TaskWithTag).tagName}-${taskList[index - 1].id}`
                  : taskList[index - 1].id.toString()
               : null,
         nextTaskId:
            index >= 0 && index < taskList.length - 1
               ? 'tagName' in taskList[index + 1]
                  ? `${(taskList[index + 1] as TaskWithTag).tagName}-${taskList[index + 1].id}`
                  : taskList[index + 1].id.toString()
               : null,
      };
   }, [task, taskId, isSubtask, allTasksData.data, currentTagData]);

   // Generate task identifier - for subtasks, show the full path
   const taskIdentifier = React.useMemo(() => {
      if (isSubtask) {
         // Extract the numeric part for subtasks
         const numericPart = extractTaskId(taskId);
         const tagPrefix = tagName && tagName !== 'master' ? getTagPrefix(tagName) : undefined;
         return formatTaskIdentifier(numericPart, tagName, tagPrefix);
      }
      const tagPrefix = tagName && tagName !== 'master' ? getTagPrefix(tagName) : undefined;
      return formatTaskIdentifier(task.id, tagName, tagPrefix);
   }, [isSubtask, taskId, tagName, task.id]);

   // Convert to Status and Priority interfaces for selectors
   // Normalize both 'in-progress' and 'in_progress' to 'in_progress'
   const normalizedStatus =
      task.status === 'in-progress' || task.status === 'in_progress' ? 'in_progress' : task.status;
   const statusObject: Status = {
      id: normalizedStatus,
      name: statusInfo.name,
      color: statusInfo.color,
      icon: statusInfo.icon,
   };

   const priorityObject: Priority = {
      id: task.priority,
      name: priority.name,
      icon: priority.icon,
   };

   // Convert assignee to User interface
   const assigneeUser: User | null = task.assignee
      ? {
           id: task.assignee,
           name: task.assignee,
           email: `${task.assignee}@example.com`,
           avatarUrl: `https://api.dicebear.com/9.x/glass/svg?seed=${task.assignee}`,
           status: 'online' as const,
           role: 'Member' as const,
           joinedDate: new Date().toISOString(),
           teamIds: [],
        }
      : null;

   return (
      <div className="flex flex-1 overflow-hidden">
         {/* Main Content */}
         <main className="flex-1 overflow-y-auto relative">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background border-b">
               <div className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-4">
                     {/* Task Identifier */}
                     <h2 className="text-lg font-semibold">{taskIdentifier}</h2>

                     {/* Options Menu */}
                     <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                     </Button>
                  </div>

                  <div className="flex items-center gap-4">
                     {/* Task Count */}
                     {taskIndex > 0 && (
                        <span className="text-sm text-muted-foreground">
                           {taskIndex} / {totalTasks}
                        </span>
                     )}

                     {/* Navigation Arrows */}
                     <div className="flex items-center gap-1">
                        <Button
                           variant="ghost"
                           size="icon"
                           className="h-8 w-8"
                           onClick={() => prevTaskId && openTask(prevTaskId)}
                           disabled={!prevTaskId}
                        >
                           <ChevronUp className="h-4 w-4" />
                           <span className="sr-only">Previous task</span>
                        </Button>

                        <Button
                           variant="ghost"
                           size="icon"
                           className="h-8 w-8"
                           onClick={() => nextTaskId && openTask(nextTaskId)}
                           disabled={!nextTaskId}
                        >
                           <ChevronDown className="h-4 w-4" />
                           <span className="sr-only">Next task</span>
                        </Button>
                     </div>

                     {/* Close Button */}
                     <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeTask}>
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                     </Button>
                  </div>
               </div>
            </div>

            <div className="max-w-4xl px-6 py-6">
               <h1 className="text-2xl font-semibold mb-4">{task.title}</h1>

               <p className="text-muted-foreground mb-8">
                  {task.description || 'Add description...'}
               </p>

               {/* Taskmaster Runner */}
               <RunnerPanel taskId={extractTaskId(taskId)} />

               {/* Details Section */}
               {task.details && (
                  <div className="mb-8">
                     <h3 className="text-sm font-medium mb-3">Implementation Details</h3>
                     <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded-md p-4">
                        {task.details}
                     </div>
                  </div>
               )}

               {/* Test Strategy Section */}
               {task.testStrategy && (
                  <div className="mb-8">
                     <h3 className="text-sm font-medium mb-3">Test Strategy</h3>
                     <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded-md p-4">
                        {task.testStrategy}
                     </div>
                  </div>
               )}

               {/* Complexity Reasoning */}
               {task.complexity?.reasoning && (
                  <div className="mb-8">
                     <h3 className="text-sm font-medium mb-3">Complexity Analysis</h3>
                     <p className="text-sm text-muted-foreground">{task.complexity.reasoning}</p>
                  </div>
               )}

               {/* Subtasks */}
               {task.subtasks && task.subtasks.length > 0 ? (
                  <div className="mb-8">
                     <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                           <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setIsSubtasksExpanded(!isSubtasksExpanded)}
                           >
                              <ChevronRight
                                 className={cn(
                                    'h-4 w-4 transition-transform',
                                    isSubtasksExpanded && 'rotate-90'
                                 )}
                              />
                              <span className="font-medium text-sm text-muted-foreground">
                                 Sub-tasks
                              </span>
                           </Button>
                           <SubtaskProgress
                              completed={subtaskCount.completed}
                              total={subtaskCount.total}
                              className="ml-2"
                           />
                        </div>
                        <div className="flex items-center gap-2">
                           <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Plus className="h-4 w-4" />
                           </Button>
                        </div>
                     </div>

                     {isSubtasksExpanded && (
                        <div className="space-y-0.5">
                           {task.subtasks.map((subtask) => {
                              const subtaskStatus =
                                 TASKMASTER_STATUS_MAP[
                                    subtask.status as keyof typeof TASKMASTER_STATUS_MAP
                                 ] || TASKMASTER_STATUS_MAP.pending;

                              const subtaskStatusObject: Status = {
                                 id:
                                    subtask.status === 'in-progress'
                                       ? 'in_progress'
                                       : subtask.status,
                                 name: subtaskStatus.name,
                                 color: subtaskStatus.color,
                                 icon: subtaskStatus.icon,
                              };

                              // Create subtask ID using dot notation
                              const parentNumericId = extractTaskId(taskId);
                              const subtaskId = taskId.includes('-')
                                 ? `${taskId.substring(0, taskId.lastIndexOf('-'))}-${parentNumericId}.${subtask.id}`
                                 : `${parentNumericId}.${subtask.id}`;

                              return (
                                 <div
                                    key={subtask.id}
                                    className="flex items-center gap-2 py-1 px-2 hover:bg-muted/50 rounded-md cursor-pointer"
                                    onClick={(e) => {
                                       // Check if the click originated from an interactive element
                                       const target = e.target as HTMLElement;
                                       const isInteractive = target.closest(
                                          'button, [role="button"], [role="combobox"], [data-state]'
                                       );
                                       if (!isInteractive) {
                                          openTask(subtaskId);
                                       }
                                    }}
                                 >
                                    <div
                                       onClick={(e) => {
                                          e.stopPropagation();
                                       }}
                                    >
                                       <StatusSelector
                                          status={subtaskStatusObject}
                                          taskId={subtaskId}
                                          tagName={tagName}
                                       />
                                    </div>
                                    <span className={cn('flex-1 text-sm font-medium')}>
                                       {subtask.title}
                                    </span>
                                    {subtask.priority && (
                                       <Badge variant="secondary" className="text-xs">
                                          {subtask.priority}
                                       </Badge>
                                    )}
                                    <span className="text-xs text-muted-foreground font-mono">
                                       {formatSubtaskId(task.id, subtask.id, tagName)}
                                    </span>
                                 </div>
                              );
                           })}
                        </div>
                     )}
                  </div>
               ) : (
                  // Show "Add sub-tasks" button when there are no subtasks and we have a recommendation
                  (!task.subtasks || task.subtasks.length === 0) &&
                  task.complexity?.recommendedSubtasks &&
                  task.complexity.recommendedSubtasks > 0 && (
                     <div className="mb-8">
                        <Button
                           variant="ghost"
                           size="sm"
                           className="w-full justify-start gap-2 h-auto py-2 px-3 items-start"
                           onClick={() => {}}
                        >
                           <Plus className="h-4 w-4 flex-shrink-0 mt-0.5" />
                           <div className="flex flex-col items-start gap-1 text-left">
                              <span className="text-muted-foreground font-medium">
                                 Add sub-tasks ({task.complexity.recommendedSubtasks})
                              </span>
                              {task.complexity.expansionPrompt && (
                                 <span className="text-xs text-muted-foreground whitespace-normal">
                                    {task.complexity.expansionPrompt}
                                 </span>
                              )}
                           </div>
                        </Button>
                     </div>
                  )
               )}

               {/* Dependencies */}
               {task.dependencies && task.dependencies.length > 0 && (
                  <div className="mb-8">
                     <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                           <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setIsDependenciesExpanded(!isDependenciesExpanded)}
                           >
                              <ChevronRight
                                 className={cn(
                                    'h-4 w-4 transition-transform',
                                    isDependenciesExpanded && 'rotate-90'
                                 )}
                              />
                              <span className="font-medium text-sm text-muted-foreground">
                                 Dependencies
                              </span>
                           </Button>
                        </div>
                     </div>

                     {isDependenciesExpanded && (
                        <div className="space-y-0.5">
                           {task.dependencies.map((dep) => {
                              // Get the dependency task
                              let depTask: TaskmasterTask | TaskWithTag | undefined;

                              // Get the appropriate task list based on context
                              if ('tagName' in task && task.tagName) {
                                 const tagTasks = allTasksData.data?.tasksByTag?.[task.tagName];
                                 depTask = tagTasks?.find((t) => {
                                    // Convert dep to number for comparison since task IDs are numbers
                                    return (
                                       t.id === (typeof dep === 'string' ? parseInt(dep, 10) : dep)
                                    );
                                 });
                              } else {
                                 depTask = currentTagData.tasks?.find(
                                    (t) =>
                                       t.id === (typeof dep === 'string' ? parseInt(dep, 10) : dep)
                                 );
                              }

                              if (!depTask) {
                                 // Fallback if task not found
                                 return (
                                    <div
                                       key={dep}
                                       className="flex items-center gap-2 py-1 px-2 hover:bg-muted/50 rounded-md cursor-pointer text-muted-foreground"
                                       onClick={() => {
                                          const depTaskId =
                                             'tagName' in task && task.tagName
                                                ? `${task.tagName}-${dep}`
                                                : dep.toString();
                                          openTask(depTaskId);
                                       }}
                                    >
                                       <span className="text-sm">
                                          Task {formatTaskId(dep, tagName)} (not found)
                                       </span>
                                    </div>
                                 );
                              }

                              // Create dependency task ID
                              const depTaskId =
                                 'tagName' in task && task.tagName
                                    ? `${task.tagName}-${dep}`
                                    : dep.toString();

                              const depStatusInfo =
                                 TASKMASTER_STATUS_MAP[
                                    depTask.status as keyof typeof TASKMASTER_STATUS_MAP
                                 ] || TASKMASTER_STATUS_MAP.pending;

                              const depStatusObject: Status = {
                                 id:
                                    depTask.status === 'in-progress'
                                       ? 'in_progress'
                                       : depTask.status,
                                 name: depStatusInfo.name,
                                 color: depStatusInfo.color,
                                 icon: depStatusInfo.icon,
                              };

                              return (
                                 <div
                                    key={dep}
                                    className="flex items-center gap-2 py-1 px-2 hover:bg-muted/50 rounded-md cursor-pointer"
                                    onClick={(e) => {
                                       // Check if the click originated from an interactive element
                                       const target = e.target as HTMLElement;
                                       const isInteractive = target.closest(
                                          'button, [role="button"], [role="combobox"], [data-state]'
                                       );
                                       if (!isInteractive) {
                                          openTask(depTaskId);
                                       }
                                    }}
                                 >
                                    <div
                                       onClick={(e) => {
                                          e.stopPropagation();
                                       }}
                                    >
                                       <StatusSelector
                                          status={depStatusObject}
                                          taskId={depTaskId}
                                          tagName={tagName}
                                       />
                                    </div>
                                    <span className={cn('flex-1 text-sm font-medium')}>
                                       {depTask.title}
                                    </span>
                                    <span className="text-xs text-muted-foreground font-mono">
                                       {formatTaskId(dep, tagName)}
                                    </span>
                                 </div>
                              );
                           })}
                        </div>
                     )}
                  </div>
               )}
            </div>
         </main>

         {/* Properties Sidebar */}
         <aside className="w-80 border-l overflow-y-auto">
            <div className="p-6">
               {/* Properties Header */}
               <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-medium">Properties</h3>
                  <Button
                     variant="ghost"
                     size="icon"
                     className="h-6 w-6"
                     onClick={() => {
                        // Copy current URL to clipboard
                        const url = window.location.href;
                        navigator.clipboard.writeText(url);
                     }}
                  >
                     <Link className="h-3 w-3" />
                     <span className="sr-only">Copy task URL</span>
                  </Button>
               </div>

               {/* Properties List */}
               <div className="space-y-1">
                  {/* Status */}
                  <div className="flex items-center py-2">
                     <StatusSelector
                        status={statusObject}
                        taskId={taskId}
                        tagName={tagName}
                        showLabel
                     />
                  </div>

                  {/* Priority */}
                  <div className="flex items-center py-2">
                     <PrioritySelector
                        priority={priorityObject}
                        taskId={taskId}
                        tagName={tagName}
                        showLabel
                     />
                  </div>

                  {/* Assignee */}
                  <div className="flex items-center py-2">
                     <AssigneeSelector
                        user={assigneeUser}
                        taskId={taskId}
                        tagName={tagName}
                        showLabel
                     />
                  </div>

                  {/* Estimate / Complexity Score */}
                  <div className="flex items-center py-2">
                     <EstimateSelector
                        estimate={task.complexity?.score}
                        taskId={taskId}
                        showLabel
                     />
                  </div>

                  {/* Tag */}
                  <div className="flex items-center py-2">
                     <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-2 h-8 px-2 font-normal"
                     >
                        <GitBranch className="h-4 w-4" />
                        <span className="text-sm">{tagName}</span>
                     </Button>
                  </div>
               </div>

               {/* Labels Section */}
               {task.labels && task.labels.length > 0 && (
                  <div className="mt-8">
                     <h3 className="text-sm font-medium mb-3">Labels</h3>
                     <div className="flex flex-wrap gap-2">
                        {task.labels.map((label) => (
                           <Badge key={label} variant="secondary" className="text-xs">
                              {label}
                           </Badge>
                        ))}
                     </div>
                  </div>
               )}
            </div>
         </aside>
      </div>
   );
}
