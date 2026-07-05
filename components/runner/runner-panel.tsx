'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Play, Repeat, RefreshCw, Shield, SkipForward, Square, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
   useRunNext,
   useRunTask,
   useRunnerLogs,
   useRunnerStatus,
   useStartLoop,
   useStopRun,
} from '@/hooks/use-runner';
import { RunRecord } from '@/types/runner';
import { RunStatusBadge } from './run-status-badge';

interface RunnerPanelProps {
   /** Plain Taskmaster task ID (e.g. "12" or "12.3") for the open task. */
   taskId: string;
}

function RunMetadata({ run }: { run: RunRecord }) {
   return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
         <span className="font-mono">{run.runId}</span>
         <span>mode: {run.mode}</span>
         {run.taskId && <span>task: {run.taskId}</span>}
         <span>started: {format(new Date(run.startedAt), 'MMM dd HH:mm:ss')}</span>
         {run.finishedAt && (
            <span>finished: {format(new Date(run.finishedAt), 'MMM dd HH:mm:ss')}</span>
         )}
         {run.exitCode !== null && <span>exit code: {run.exitCode}</span>}
      </div>
   );
}

export function RunnerPanel({ taskId }: RunnerPanelProps) {
   const { data: status, isLoading } = useRunnerStatus();
   const runTask = useRunTask();
   const runNext = useRunNext();
   const startLoop = useStartLoop();
   const stopRun = useStopRun();

   const activeRun = status?.activeRun ?? null;
   const lock = status?.lock ?? null;

   // Show the active run's logs, otherwise the most recent finished run.
   const displayedRun = activeRun ?? status?.recentRuns?.[0] ?? null;
   const isRunActive = !!activeRun;

   const {
      data: logs,
      refetch: refetchLogs,
      isFetching: isFetchingLogs,
   } = useRunnerLogs(displayedRun?.runId ?? null, isRunActive);

   // Keep the log view pinned to the bottom while a run is producing output.
   const logRef = React.useRef<HTMLPreElement>(null);
   React.useEffect(() => {
      if (isRunActive && logRef.current) {
         logRef.current.scrollTop = logRef.current.scrollHeight;
      }
   }, [logs?.content, isRunActive]);

   const isStarting =
      runTask.isPending || runNext.isPending || startLoop.isPending || stopRun.isPending;
   const canStart = !isRunActive && !isStarting && !(lock && !lock.stale);

   return (
      <div className="mb-8 rounded-md border">
         <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-3">
               <h3 className="text-sm font-medium">Taskmaster Runner</h3>
               <RunStatusBadge status={displayedRun && !isLoading ? displayedRun.status : 'idle'} />
            </div>
            {isRunActive && (
               <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => stopRun.mutate({ runId: activeRun.runId })}
                  disabled={stopRun.isPending}
               >
                  <Square className="h-3.5 w-3.5" />
                  Stop Run
               </Button>
            )}
         </div>

         <div className="space-y-4 p-4">
            {/* Stale/foreign lock warning */}
            {lock && !activeRun && (
               <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {lock.stale ? (
                     <span>
                        A stale runner lock was found (run {lock.runId}). It will be cleared
                        automatically on the next start.
                     </span>
                  ) : (
                     <span>
                        Another runner process (pid {lock.pid}) appears to be active in this
                        project. Starting a new run is blocked until it finishes.
                     </span>
                  )}
               </div>
            )}

            {/* Controls */}
            <div className="flex flex-wrap gap-2">
               <Button size="sm" onClick={() => runTask.mutate({ taskId })} disabled={!canStart}>
                  <Play className="h-3.5 w-3.5" />
                  Run with Claude
               </Button>
               <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runNext.mutate()}
                  disabled={!canStart}
               >
                  <SkipForward className="h-3.5 w-3.5" />
                  Run Next
               </Button>
               <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startLoop.mutate({ sandbox: false })}
                  disabled={!canStart}
               >
                  <Repeat className="h-3.5 w-3.5" />
                  Start Loop
               </Button>
               <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startLoop.mutate({ sandbox: true })}
                  disabled={!canStart}
               >
                  <Shield className="h-3.5 w-3.5" />
                  Start Sandbox Loop
               </Button>
            </div>

            {/* Run metadata + logs */}
            {displayedRun && (
               <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                     <RunMetadata run={displayedRun} />
                     <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => refetchLogs()}
                        title="Refresh logs"
                     >
                        <RefreshCw
                           className={cn('h-3.5 w-3.5', isFetchingLogs && 'animate-spin')}
                        />
                     </Button>
                  </div>

                  {displayedRun.error && (
                     <p className="text-xs text-red-600 dark:text-red-400">{displayedRun.error}</p>
                  )}

                  <pre
                     ref={logRef}
                     className="max-h-72 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap break-words"
                  >
                     {logs?.truncated && '… (log truncated, showing latest output)\n'}
                     {logs?.content || 'No log output yet.'}
                  </pre>
               </div>
            )}
         </div>
      </div>
   );
}
