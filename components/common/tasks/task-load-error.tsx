'use client';

import { AlertTriangle, FileWarning, FolderX, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TaskmasterApiError } from '@/lib/api/taskmaster';
import { useRefreshTasks, useTaskSource } from '@/hooks/use-task-source';

/**
 * Explicit error state for task loading. There is deliberately no fallback to
 * mock/demo tasks: when the canonical tasks file cannot be loaded, the user
 * sees what went wrong and how to fix it.
 */

interface ErrorPresentation {
   icon: typeof AlertTriangle;
   title: string;
   hint: string;
}

function presentError(code: string | undefined): ErrorPresentation {
   switch (code) {
      case 'TASKS_FILE_NOT_FOUND':
         return {
            icon: FolderX,
            title: 'Taskmaster tasks file not found',
            hint: 'The active project root has no .taskmaster/tasks/tasks.json. Run "task-master init" in the project, or pick a different project root in Settings → General.',
         };
      case 'PROJECT_ROOT_NOT_ALLOWLISTED':
         return {
            icon: ShieldAlert,
            title: 'Project root is not allowlisted',
            hint: 'Add the project root in Settings → General → Project root allowlist, then set it as default.',
         };
      case 'PROJECT_ROOT_INVALID':
         return {
            icon: FolderX,
            title: 'Project root is invalid',
            hint: 'Check the configured project root in Settings → General.',
         };
      case 'INVALID_JSON':
         return {
            icon: FileWarning,
            title: 'Failed to parse tasks.json',
            hint: 'The tasks file contains invalid JSON. If Taskmaster is mid-write, retry in a moment; otherwise fix the file (it is the canonical task source and is never modified by this view).',
         };
      case 'UNSUPPORTED_FORMAT':
         return {
            icon: FileWarning,
            title: 'Unsupported tasks.json format',
            hint: 'The file does not match a known Taskmaster format (tagged contexts, { "tasks": [...] }, or a task array).',
         };
      case 'PERMISSION_DENIED':
         return {
            icon: ShieldAlert,
            title: 'Permission denied reading tasks file',
            hint: 'Check filesystem permissions for the project root.',
         };
      default:
         return {
            icon: AlertTriangle,
            title: 'Error loading tasks',
            hint: 'Check the Developer settings diagnostics for details.',
         };
   }
}

export function TaskLoadErrorState({ error }: { error: unknown }) {
   const refreshTasks = useRefreshTasks();
   const { data: source } = useTaskSource();

   const code = error instanceof TaskmasterApiError ? error.code : undefined;
   const message = error instanceof Error ? error.message : 'Unknown error';
   const { icon: Icon, title, hint } = presentError(code);

   return (
      <div className="flex h-full w-full items-center justify-center p-6">
         <div className="flex max-w-lg flex-col items-center gap-3 text-center">
            <Icon className="h-8 w-8 text-red-500" />
            <h2 className="text-base font-medium">{title}</h2>
            <p className="text-sm text-muted-foreground">{message}</p>
            <p className="text-xs text-muted-foreground">{hint}</p>
            {source && (
               <p
                  className="max-w-full truncate font-mono text-xs text-muted-foreground"
                  title={source.tasksFilePath}
               >
                  {source.tasksFilePath}
               </p>
            )}
            <Button variant="outline" size="sm" onClick={() => refreshTasks()}>
               <RefreshCw className="h-3.5 w-3.5" />
               <span className="ml-1">Retry</span>
            </Button>
         </div>
      </div>
   );
}

export function TasksEmptyState() {
   const { data: source } = useTaskSource();
   const refreshTasks = useRefreshTasks();

   return (
      <div className="flex h-full w-full items-center justify-center p-6">
         <div className="flex max-w-lg flex-col items-center gap-3 text-center">
            <h2 className="text-base font-medium">No tasks found</h2>
            <p className="text-sm text-muted-foreground">
               The tasks file was loaded but contains no tasks. Add tasks with the Taskmaster CLI
               (e.g. <code className="font-mono">task-master parse-prd</code> or{' '}
               <code className="font-mono">task-master add-task</code>).
            </p>
            {source && (
               <p
                  className="max-w-full truncate font-mono text-xs text-muted-foreground"
                  title={source.tasksFilePath}
               >
                  {source.tasksFilePath}
               </p>
            )}
            <Button variant="outline" size="sm" onClick={() => refreshTasks()}>
               <RefreshCw className="h-3.5 w-3.5" />
               <span className="ml-1">Refresh</span>
            </Button>
         </div>
      </div>
   );
}
