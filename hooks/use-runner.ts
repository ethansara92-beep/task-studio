import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
   fetchRunnerLogs,
   fetchRunnerStatus,
   runNext,
   runTask,
   startLoop,
   stopRun,
   StartRunResult,
} from '@/lib/api/runner';
import { RunnerApiResponse, RunnerErrorCode, RunnerStatusData } from '@/types/runner';
import { useSettings } from '@/hooks/use-settings';

export const runnerKeys = {
   all: ['runner'] as const,
   status: () => [...runnerKeys.all, 'status'] as const,
   logs: (runId: string) => [...runnerKeys.all, 'logs', runId] as const,
};

const ACTIVE_POLL_MS = 2000;
const IDLE_POLL_MS = 5000;
const LOG_POLL_MS = 1500;

/** Maps API error codes to actionable user-facing messages. */
export function runnerErrorMessage(code: RunnerErrorCode | undefined, fallback?: string): string {
   switch (code) {
      case 'TM_NOT_FOUND':
         return (
            fallback ||
            "Taskmaster CLI ('tm') not found. Install Taskmaster and verify tm works in a terminal."
         );
      case 'RUNNER_BUSY':
         return fallback || 'Another run is already active for this project. Stop it first.';
      case 'INVALID_TASK_ID':
         return fallback || 'Invalid task ID.';
      case 'INVALID_PROJECT_ROOT':
         return fallback || 'Project root is invalid or not a Taskmaster project.';
      case 'NO_NEXT_TASK':
         return fallback || 'No eligible pending task found in the current tag.';
      case 'RUN_NOT_FOUND':
         return fallback || 'The run is no longer active.';
      case 'RUNNER_DISABLED':
         return fallback || 'The runner is disabled in Settings → Runner.';
      case 'MODE_NOT_ALLOWED':
         return fallback || 'This runner mode is not allowed in Settings → Security & Access.';
      case 'DEPENDENCIES_INCOMPLETE':
         return fallback || 'This task has incomplete dependencies.';
      default:
         return fallback || 'Runner request failed.';
   }
}

/**
 * Polls runner status; faster while a run is active. Poll rates come from
 * Settings → Preferences. Shared across all consumers.
 */
export function useRunnerStatus() {
   const { data: settings } = useSettings();
   const prefs = settings?.preferences;
   const activeInterval = prefs?.taskRefreshIntervalMs ?? ACTIVE_POLL_MS;

   return useQuery({
      queryKey: runnerKeys.status(),
      queryFn: async (): Promise<RunnerStatusData> => {
         const result = await fetchRunnerStatus();
         if (!result.success || !result.data) {
            throw new Error(result.error || 'Failed to fetch runner status');
         }
         return result.data;
      },
      refetchInterval: (query) => {
         if (prefs && !prefs.autoRefreshTasks) return false;
         return query.state.data?.activeRun ? activeInterval : IDLE_POLL_MS;
      },
   });
}

/** Polls a run's log tail while the run is active (interval from Preferences). */
export function useRunnerLogs(runId: string | null, isActive: boolean) {
   const { data: settings } = useSettings();
   const prefs = settings?.preferences;
   const interval = prefs?.logRefreshIntervalMs ?? LOG_POLL_MS;
   const autoRefresh = prefs?.logAutoRefresh ?? true;

   return useQuery({
      queryKey: runnerKeys.logs(runId ?? 'none'),
      queryFn: async () => {
         const result = await fetchRunnerLogs(runId!);
         if (!result.success || !result.data) {
            throw new Error(result.error || 'Failed to fetch logs');
         }
         return result.data;
      },
      enabled: !!runId,
      refetchInterval: isActive && autoRefresh ? interval : false,
   });
}

function useRunnerMutation<TVariables>(
   mutationFn: (variables: TVariables) => Promise<RunnerApiResponse<StartRunResult>>,
   successMessage: (data: StartRunResult) => string
) {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async (variables: TVariables) => {
         const result = await mutationFn(variables);
         if (!result.success || !result.data) {
            const error = new Error(runnerErrorMessage(result.code, result.error));
            throw error;
         }
         return result.data;
      },
      onSuccess: (data) => {
         toast.success(successMessage(data));
         queryClient.invalidateQueries({ queryKey: runnerKeys.status() });
      },
      onError: (error: Error) => {
         toast.error(error.message);
         queryClient.invalidateQueries({ queryKey: runnerKeys.status() });
      },
   });
}

export function useRunTask() {
   return useRunnerMutation(
      ({ taskId }: { taskId: string }) => runTask(taskId),
      (data) => `Started task ${data.taskId} with Claude`
   );
}

export function useRunNext() {
   return useRunnerMutation(
      (_: void) => runNext(),
      (data) => `Started next task ${data.taskId} with Claude`
   );
}

export function useStartLoop() {
   return useRunnerMutation(
      ({ sandbox }: { sandbox: boolean }) => startLoop(sandbox),
      (data) => (data.run.mode === 'loop-sandbox' ? 'Started sandbox loop' : 'Started loop')
   );
}

export function useStopRun() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async ({ runId }: { runId: string }) => {
         const result = await stopRun(runId);
         if (!result.success || !result.data) {
            throw new Error(runnerErrorMessage(result.code, result.error));
         }
         return result.data;
      },
      onSuccess: () => {
         toast.success('Stop requested - the run will be marked cancelled once it exits');
         queryClient.invalidateQueries({ queryKey: runnerKeys.status() });
      },
      onError: (error: Error) => {
         toast.error(error.message);
         queryClient.invalidateQueries({ queryKey: runnerKeys.status() });
      },
   });
}
