'use client';

import { Task } from '@/lib/task-view';
import { Status } from '@/lib/status';
import { useTasksStore } from '@/store/tasks-store';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { FC, useRef } from 'react';
import { useDrop } from 'react-dnd';
import { Button } from '../../ui/button';
import { TaskDragType, TaskGrid } from './task-grid';
import { TaskWithSubtasks } from './task-with-subtasks';
import { useCreateTaskStore } from '@/store/create-task-store';
import { sortTasksByPriority } from '@/lib/task-view';
import { AnimatePresence, motion } from 'motion/react';
import { useQueryState } from 'nuqs';

interface GroupTasksProps {
   status: Status;
   tasks: Task[];
   count: number;
   showTagBadge?: boolean;
}

export function GroupTasks({ status, tasks, count, showTagBadge }: GroupTasksProps) {
   const [viewType] = useQueryState('view', {
      defaultValue: 'list',
      parse: (value) => (value === 'board' || value === 'list' ? value : 'list'),
      history: 'push',
   });
   const isViewTypeBoard = viewType === 'board';
   const { openModal } = useCreateTaskStore();
   const sortedTasks = sortTasksByPriority(tasks);

   return (
      <div
         className={cn(
            'bg-container',
            isViewTypeBoard
               ? 'overflow-hidden rounded-md h-full flex-shrink-0 w-[348px] flex flex-col'
               : ''
         )}
      >
         <div
            className={cn(
               'sticky top-0 z-10 bg-container w-full',
               isViewTypeBoard ? 'rounded-t-md h-[50px]' : 'h-10'
            )}
         >
            <div
               className={cn(
                  'w-full h-full flex items-center justify-between bg-muted/50',
                  isViewTypeBoard ? 'px-3' : 'px-6'
               )}
            >
               <div className="flex items-center gap-2">
                  <status.icon />
                  <span className="text-sm font-medium">{status.name}</span>
                  <span className="text-sm text-muted-foreground">{count}</span>
               </div>

               <Button
                  className="size-6"
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                     e.stopPropagation();
                     openModal(status);
                  }}
               >
                  <Plus className="size-4" />
               </Button>
            </div>
         </div>

         {viewType === 'list' ? (
            <div className="space-y-0">
               {sortedTasks.map((task) => (
                  <TaskWithSubtasks
                     key={task.id}
                     task={task}
                     layoutId={true}
                     showTagBadge={showTagBadge}
                  />
               ))}
            </div>
         ) : (
            <TaskGridList tasks={tasks} status={status} showTagBadge={showTagBadge} />
         )}
      </div>
   );
}

const TaskGridList: FC<{ tasks: Task[]; status: Status; showTagBadge?: boolean }> = ({
   tasks,
   status,
   showTagBadge,
}) => {
   const ref = useRef<HTMLDivElement>(null);
   const { updateTaskStatus } = useTasksStore();

   // Set up drop functionality to accept only task items.
   const [{ isOver }, drop] = useDrop(() => ({
      accept: TaskDragType,
      drop(item: Task, monitor) {
         if (monitor.didDrop() && item.status.id !== status.id) {
            updateTaskStatus(item.id, status);
         }
      },
      collect: (monitor) => ({
         isOver: !!monitor.isOver(),
      }),
   }));
   drop(ref);

   const sortedTasks = sortTasksByPriority(tasks);

   return (
      <div
         ref={ref}
         className="flex-1 h-full overflow-y-auto p-2 space-y-2 bg-zinc-50/50 dark:bg-zinc-900/50 relative"
      >
         <AnimatePresence>
            {isOver && (
               <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="fixed top-0 left-0 right-0 bottom-0 z-10 flex items-center justify-center pointer-events-none bg-background/90"
                  style={{
                     width: ref.current?.getBoundingClientRect().width || '100%',
                     height: ref.current?.getBoundingClientRect().height || '100%',
                     transform: `translate(${ref.current?.getBoundingClientRect().left || 0}px, ${ref.current?.getBoundingClientRect().top || 0}px)`,
                  }}
               >
                  <div className="bg-background border border-border rounded-md p-3 shadow-md max-w-[90%]">
                     <p className="text-sm font-medium text-center">Board ordered by priority</p>
                  </div>
               </motion.div>
            )}
         </AnimatePresence>
         {sortedTasks.map((task) => (
            <TaskGrid key={task.id} task={task} showTagBadge={showTagBadge} />
         ))}
      </div>
   );
};
