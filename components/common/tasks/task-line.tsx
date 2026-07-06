'use client';

import { Task } from '@/lib/task-view';
import { format } from 'date-fns';
import { AssigneeUser } from './assignee-user';
import { LabelBadge } from './label-badge';
import { PrioritySelector } from './priority-selector';
import { TagBadge } from './tag-badge';
import { StatusSelector } from './status-selector';
import { SubtaskProgress } from './subtask-progress';
import { motion } from 'motion/react';
import { useTaskViewUrl } from '@/hooks/use-task-view-url';
import { countSubtasks } from '@/lib/subtask-utils';
import { cn } from '@/lib/utils';

import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { TaskContextMenu } from './task-context-menu';
import { TaskRunningIndicator } from '@/components/runner/task-running-indicator';

interface TaskLineProps {
   task: Task & { isSubtask?: boolean; parentId?: string };
   layoutId?: boolean;
   showTagBadge?: boolean;
}

export function TaskLine({ task, layoutId = false, showTagBadge = true }: TaskLineProps) {
   const { openTask } = useTaskViewUrl();

   // Count subtasks if they exist
   const subtaskCount = task.subtasks
      ? countSubtasks({ subtasks: task.subtasks } as any)
      : { completed: 0, total: 0 };

   const handleClick = (e: React.MouseEvent) => {
      // Check if the click originated from an interactive element
      const target = e.target as HTMLElement;
      const isInteractive = target.closest(
         'button, [role="button"], [role="combobox"], a, input, select, textarea'
      );

      if (!isInteractive) {
         openTask(task.id);
      }
   };

   return (
      <ContextMenu>
         <ContextMenuTrigger asChild>
            <motion.div
               {...(layoutId && { layoutId: `task-line-${task.identifier}` })}
               className={cn(
                  'w-full flex items-center justify-start h-11 px-6 hover:bg-sidebar/50 cursor-pointer relative'
               )}
               onClick={handleClick}
            >
               <div className="flex items-center gap-0.5">
                  <div onClick={(e) => e.stopPropagation()}>
                     <PrioritySelector
                        priority={task.priority}
                        taskId={task.id}
                        tagName={task.tag?.id}
                     />
                  </div>
                  <span className="text-sm hidden sm:inline-block text-muted-foreground font-medium w-[52px] truncate shrink-0 mr-0.5">
                     {task.identifier}
                  </span>
                  <div onClick={(e) => e.stopPropagation()}>
                     <StatusSelector status={task.status} taskId={task.id} tagName={task.tag?.id} />
                  </div>
               </div>
               <span className="min-w-0 flex items-center justify-start mr-1 ml-0.5">
                  <span
                     className={cn(
                        'text-xs sm:text-sm font-medium sm:font-semibold truncate',
                        task.isSubtask && 'font-normal sm:font-normal'
                     )}
                  >
                     {task.title}
                  </span>
               </span>
               <TaskRunningIndicator taskId={task.id} className="ml-1.5" />
               {subtaskCount.total > 0 && (
                  <SubtaskProgress
                     completed={subtaskCount.completed}
                     total={subtaskCount.total}
                     className="shrink-0 ml-1"
                  />
               )}
               <div className="flex items-center justify-end gap-2 ml-auto sm:w-fit">
                  <div className="w-3 shrink-0"></div>
                  <div className="-space-x-5 hover:space-x-1 lg:space-x-1 items-center justify-end hidden sm:flex duration-200 transition-all">
                     <LabelBadge label={task.labels} />
                     {task.tag && showTagBadge && <TagBadge tag={task.tag} />}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline-block">
                     {format(new Date(task.createdAt), 'MMM dd')}
                  </span>
                  <AssigneeUser user={task.assignee} />
               </div>
            </motion.div>
         </ContextMenuTrigger>
         <TaskContextMenu taskId={task.id} />
      </ContextMenu>
   );
}
