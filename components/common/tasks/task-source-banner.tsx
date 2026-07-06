'use client';

import { AlertTriangle, FolderOpen, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRefreshTasks, useTaskSource } from '@/hooks/use-task-source';

/**
 * Slim bar above the task views showing which project root and tasks file the
 * data comes from, with a manual refresh. Tasks always come from
 * `<projectRoot>/.taskmaster/tasks/tasks.json` - never from demo data.
 */
export function TaskSourceBanner() {
   const { data: source } = useTaskSource();
   const refreshTasks = useRefreshTasks();

   if (!source) return null;

   return (
      <div className="flex items-center gap-2 border-b bg-muted/30 px-6 py-1 text-xs text-muted-foreground">
         <FolderOpen className="h-3.5 w-3.5 shrink-0" />
         <span className="truncate font-mono" title={source.tasksFilePath}>
            {source.projectRoot}
         </span>
         {source.fileExists ? (
            <span className="shrink-0">
               · {source.parsedTaskCount ?? 0} tasks
               {source.tagCount !== null && source.tagCount > 1 ? ` · ${source.tagCount} tags` : ''}
            </span>
         ) : (
            <span className="flex shrink-0 items-center gap-1 text-red-500">
               <AlertTriangle className="h-3 w-3" />
               tasks.json not found
            </span>
         )}
         {source.parseError && (
            <span
               className="flex shrink-0 items-center gap-1 text-red-500"
               title={source.parseError}
            >
               <AlertTriangle className="h-3 w-3" />
               parse error
            </span>
         )}
         <div className="ml-auto flex items-center gap-1">
            <Button
               variant="ghost"
               size="xs"
               className="h-6 px-2 text-xs"
               onClick={() => refreshTasks()}
            >
               <RefreshCw className="h-3 w-3" />
               <span className="ml-1 hidden sm:inline">Refresh</span>
            </Button>
         </div>
      </div>
   );
}
