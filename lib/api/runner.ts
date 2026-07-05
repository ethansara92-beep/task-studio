// API client for the Taskmaster runner endpoints

import { RunRecord, RunnerApiResponse, RunnerLogsData, RunnerStatusData } from '@/types/runner';

const API_BASE = '/api/runner';

async function postJson<T>(path: string, body: unknown): Promise<RunnerApiResponse<T>> {
   try {
      const response = await fetch(`${API_BASE}${path}`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(body),
      });
      return await response.json();
   } catch (error) {
      return {
         success: false,
         error: error instanceof Error ? error.message : 'Runner request failed',
         timestamp: new Date().toISOString(),
      };
   }
}

export interface StartRunResult {
   runId: string;
   taskId?: string | null;
   run: RunRecord;
}

export function runTask(taskId: string): Promise<RunnerApiResponse<StartRunResult>> {
   return postJson('/run-task', { taskId });
}

export function runNext(): Promise<RunnerApiResponse<StartRunResult>> {
   return postJson('/run-next', {});
}

export function startLoop(sandbox: boolean): Promise<RunnerApiResponse<StartRunResult>> {
   return postJson('/start-loop', { sandbox });
}

export function stopRun(
   runId: string
): Promise<RunnerApiResponse<{ runId: string; run: RunRecord }>> {
   return postJson('/stop', { runId });
}

export async function fetchRunnerStatus(): Promise<RunnerApiResponse<RunnerStatusData>> {
   try {
      const response = await fetch(`${API_BASE}/status`);
      return await response.json();
   } catch (error) {
      return {
         success: false,
         error: error instanceof Error ? error.message : 'Failed to fetch runner status',
         timestamp: new Date().toISOString(),
      };
   }
}

export async function fetchRunnerLogs(runId: string): Promise<RunnerApiResponse<RunnerLogsData>> {
   try {
      const response = await fetch(`${API_BASE}/logs?runId=${encodeURIComponent(runId)}`);
      return await response.json();
   } catch (error) {
      return {
         success: false,
         error: error instanceof Error ? error.message : 'Failed to fetch runner logs',
         timestamp: new Date().toISOString(),
      };
   }
}
