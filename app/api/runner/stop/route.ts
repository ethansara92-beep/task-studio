import { NextRequest } from 'next/server';
import { stopRunRequestSchema } from '@/types/runner';
import { parseRunnerBody, runnerFailure, runnerSuccess } from '@/lib/runner/api-helpers';
import { resolveProjectRoot } from '@/lib/runner/runner-validation';
import { stopRun } from '@/lib/runner/taskmaster-runner';

export async function POST(request: NextRequest) {
   try {
      const { runId, projectRoot } = await parseRunnerBody(
         request,
         stopRunRequestSchema,
         'INVALID_RUN_ID'
      );
      const root = await resolveProjectRoot(projectRoot);
      const run = await stopRun(root, runId);
      return runnerSuccess({ runId: run.runId, run });
   } catch (error) {
      return runnerFailure(error);
   }
}
