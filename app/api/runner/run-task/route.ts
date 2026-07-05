import { NextRequest } from 'next/server';
import { runTaskRequestSchema } from '@/types/runner';
import { parseRunnerBody, runnerFailure, runnerSuccess } from '@/lib/runner/api-helpers';
import { resolveProjectRoot } from '@/lib/runner/runner-validation';
import { startRun } from '@/lib/runner/taskmaster-runner';

export async function POST(request: NextRequest) {
   try {
      const { taskId, projectRoot } = await parseRunnerBody(
         request,
         runTaskRequestSchema,
         'INVALID_TASK_ID'
      );
      const root = await resolveProjectRoot(projectRoot);
      const run = await startRun({ projectRoot: root, mode: 'run-task', taskId });
      return runnerSuccess({ runId: run.runId, taskId: run.taskId, run }, 201);
   } catch (error) {
      return runnerFailure(error);
   }
}
