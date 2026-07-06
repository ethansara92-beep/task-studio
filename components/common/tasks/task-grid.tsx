'use client';

import { Task } from '@/ui-data/tasks';
import { format } from 'date-fns';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { DragSourceMonitor, useDrag, useDragLayer, useDrop } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';
import { AssigneeUser } from './assignee-user';
import { LabelBadge } from './label-badge';
import { PrioritySelector } from './priority-selector';
import { TagBadge } from './tag-badge';
import { StatusSelector } from './status-selector';
import { useTaskViewUrl } from '@/hooks/use-task-view-url';
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { TaskContextMenu } from './task-context-menu';
import { TaskRunningIndicator } from '@/components/runner/task-running-indicator';

export const TaskDragType = 'TASK';
type TaskGridProps = {
   task: Task;
   showTagBadge?: boolean;
};

// Custom DragLayer component to render the drag preview
function TaskDragPreview({ task }: { task: Task }) {
   return (
      <div className="w-full p-3 bg-background rounded-md border border-border/50 overflow-hidden">
         <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
               <PrioritySelector priority={task.priority} taskId={task.id} />
               <span className="text-xs text-muted-foreground font-medium">{task.identifier}</span>
            </div>
            <StatusSelector status={task.status} taskId={task.id} />
         </div>

         <h3 className="text-sm font-semibold mb-3 line-clamp-2">{task.title}</h3>

         <div className="flex flex-wrap gap-1.5 mb-3 min-h-[1.5rem]">
            <LabelBadge label={task.labels} />
            {task.tag && <TagBadge tag={task.tag} />}
         </div>

         <div className="flex items-center justify-between mt-auto pt-2">
            <span className="text-xs text-muted-foreground">
               {format(new Date(task.createdAt), 'MMM dd')}
            </span>
            <AssigneeUser user={task.assignee} />
         </div>
      </div>
   );
}

// Custom DragLayer to show custom preview during drag
export function CustomDragLayer() {
   const { itemType, isDragging, item, currentOffset } = useDragLayer((monitor) => ({
      item: monitor.getItem() as Task,
      itemType: monitor.getItemType(),
      currentOffset: monitor.getSourceClientOffset(),
      isDragging: monitor.isDragging(),
   }));

   if (!isDragging || itemType !== TaskDragType || !currentOffset) {
      return null;
   }

   return (
      <div
         className="fixed pointer-events-none z-50 left-0 top-0"
         style={{
            transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`,
            width: '348px', // Match the width of your cards
         }}
      >
         <TaskDragPreview task={item} />
      </div>
   );
}

export function TaskGrid({ task, showTagBadge = true }: TaskGridProps) {
   const ref = useRef<HTMLDivElement>(null);
   const { openTask } = useTaskViewUrl();

   // Set up drag functionality.
   const [{ isDragging }, drag, preview] = useDrag(() => ({
      type: TaskDragType,
      item: task,
      collect: (monitor: DragSourceMonitor) => ({
         isDragging: monitor.isDragging(),
      }),
   }));

   // Use empty image as drag preview (we'll create a custom one with DragLayer)
   useEffect(() => {
      preview(getEmptyImage(), { captureDraggingState: true });
   }, [preview]);

   // Set up drop functionality.
   const [, drop] = useDrop(() => ({
      accept: TaskDragType,
   }));

   // Connect drag and drop to the element.
   drag(drop(ref));

   const handleClick = (e: React.MouseEvent) => {
      // Check if the click originated from an interactive element
      const target = e.target as HTMLElement;
      const isInteractive = target.closest(
         'button, [role="button"], [role="combobox"], a, input, select, textarea'
      );

      // Don't open modal if dragging or clicking on interactive elements
      if (!isDragging && !isInteractive) {
         openTask(task.id);
      }
   };

   return (
      <ContextMenu>
         <ContextMenuTrigger asChild>
            <motion.div
               ref={ref}
               className="w-full p-3 bg-background rounded-md shadow-xs border border-border/50 cursor-pointer hover:border-border"
               layoutId={`task-grid-${task.identifier}`}
               style={{
                  opacity: isDragging ? 0.5 : 1,
                  cursor: isDragging ? 'grabbing' : 'pointer',
               }}
               onClick={handleClick}
            >
               <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                     <PrioritySelector
                        priority={task.priority}
                        taskId={task.id}
                        tagName={task.tag?.id}
                     />
                     <span className="text-xs text-muted-foreground font-medium">
                        {task.identifier}
                     </span>
                     <TaskRunningIndicator taskId={task.id} />
                  </div>
                  <StatusSelector status={task.status} taskId={task.id} tagName={task.tag?.id} />
               </div>
               <h3 className="text-sm font-semibold mb-3 line-clamp-2">{task.title}</h3>
               <div className="flex flex-wrap gap-1.5 mb-3 min-h-[1.5rem]">
                  <LabelBadge label={task.labels} />
                  {task.tag && showTagBadge && <TagBadge tag={task.tag} />}
               </div>
               <div className="flex items-center justify-between mt-auto pt-2">
                  <span className="text-xs text-muted-foreground">
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
