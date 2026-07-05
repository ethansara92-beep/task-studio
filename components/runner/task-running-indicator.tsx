'use client';

import { useRunnerStatus } from '@/hooks/use-runner';
import { extractTaskId } from '@/lib/task-id-utils';
import { cn } from '@/lib/utils';

/**
 * Small pulsing dot shown next to a task when the runner is currently
 * executing it. Uses the shared runner status query, so rendering many
 * indicators does not add extra requests.
 */
export function TaskRunningIndicator({
   taskId,
   className,
}: {
   taskId: string;
   className?: string;
}) {
   const { data } = useRunnerStatus();
   const activeRun = data?.activeRun;

   if (!activeRun || activeRun.status !== 'running' || !activeRun.taskId) {
      return null;
   }

   if (extractTaskId(taskId) !== activeRun.taskId) {
      return null;
   }

   return (
      <span
         className={cn('relative flex h-2 w-2 shrink-0', className)}
         title="Claude is working on this task"
      >
         <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75" />
         <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
      </span>
   );
}
