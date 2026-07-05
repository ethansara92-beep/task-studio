import { NextRequest } from 'next/server';
import { runNextRequestSchema } from '@/types/runner';
import { parseRunnerBody, runnerFailure, runnerSuccess } from '@/lib/runner/api-helpers';
import { resolveProjectRoot } from '@/lib/runner/runner-validation';
import { findNextTaskId } from '@/lib/runner/next-task';
import { startRun } from '@/lib/runner/taskmaster-runner';

export async function POST(request: NextRequest) {
   try {
      const { projectRoot } = await parseRunnerBody(
         request,
         runNextRequestSchema,
         'INVALID_PROJECT_ROOT'
      );
      const root = await resolveProjectRoot(projectRoot);

      // The Taskmaster CLI has no non-interactive "start next" command, so the
      // next eligible task is resolved server-side from tasks.json and started
      // as a single bounded `tm start <id>` run (see docs/taskmaster-runner.md).
      const taskId = await findNextTaskId(root);
      const run = await startRun({ projectRoot: root, mode: 'run-next', taskId });
      return runnerSuccess({ runId: run.runId, taskId: run.taskId, run }, 201);
   } catch (error) {
      return runnerFailure(error);
   }
}
