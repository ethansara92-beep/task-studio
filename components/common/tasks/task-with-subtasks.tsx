'use client';

import { Task } from '@/lib/task-view';
import { TaskmasterTask } from '@/types/taskmaster';
import { TaskLine } from './task-line';
import { TASKMASTER_STATUS_MAP } from '@/lib/taskmaster-constants';

interface TaskWithSubtasksProps {
   task: Task;
   layoutId?: boolean;
   showTagBadge?: boolean;
   indentLevel?: number;
}

interface SubtaskTask extends Task {
   isSubtask?: boolean;
   parentId?: string;
}

// Helper function to convert subtask to Task format
function subtaskToTask(subtask: TaskmasterTask, parentTask: Task, index: number): SubtaskTask {
   const statusInfo =
      TASKMASTER_STATUS_MAP[subtask.status as keyof typeof TASKMASTER_STATUS_MAP] ||
      TASKMASTER_STATUS_MAP.pending;
   // Convert Taskmaster status to UI status id
   const statusId = subtask.status === 'in-progress' ? 'in_progress' : subtask.status;

   // Extract numeric parent ID and create proper subtask ID
   const parentNumericId = parentTask.id.split('-').pop() || parentTask.id;
   const subtaskId = `${parentNumericId}.${subtask.id}`;

   return {
      id: parentTask.id.includes('-')
         ? `${parentTask.id.substring(0, parentTask.id.lastIndexOf('-'))}-${subtaskId}`
         : subtaskId,
      identifier: `${parentTask.identifier}.${subtask.id}`,
      title: subtask.title,
      description: subtask.description || '',
      status: {
         id: statusId,
         name: statusInfo.name,
         color: statusInfo.color,
         icon: statusInfo.icon,
      },
      priority: {
         id: subtask.priority || 'medium',
         name:
            (subtask.priority || 'medium').charAt(0).toUpperCase() +
            (subtask.priority || 'medium').slice(1),
      } as any,
      assignee: null, // Simplified for now
      labels:
         subtask.labels?.map((label) => ({
            id: label,
            name: label,
            color: '#8B5CF6',
         })) || [],
      tag: parentTask.tag,
      createdAt: parentTask.createdAt,
      cycleId: parentTask.cycleId,
      rank: `${parentTask.rank}.${index}`,
      subtasks: subtask.subtasks,
      isSubtask: true,
      parentId: parentTask.id,
   };
}

export function TaskWithSubtasks({
   task,
   layoutId = false,
   showTagBadge = true,
   indentLevel = 0,
}: TaskWithSubtasksProps) {
   const hasSubtasks = task.subtasks && task.subtasks.length > 0;

   return (
      <>
         {/* Parent task */}
         <TaskLine task={task} layoutId={layoutId} showTagBadge={showTagBadge} />

         {/* Subtasks - no indentation, just visual indicators */}
         {hasSubtasks && (
            <>
               {((task.subtasks as TaskmasterTask[]) || []).map((subtask, index) => {
                  const subtaskTask = subtaskToTask(subtask, task, index);

                  return (
                     <TaskWithSubtasks
                        key={subtaskTask.id}
                        task={subtaskTask}
                        layoutId={false}
                        showTagBadge={false}
                        indentLevel={indentLevel + 1}
                     />
                  );
               })}
            </>
         )}
      </>
   );
}
