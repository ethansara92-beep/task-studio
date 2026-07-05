import { NextRequest } from 'next/server';
import { startLoopRequestSchema } from '@/types/runner';
import { parseRunnerBody, runnerFailure, runnerSuccess } from '@/lib/runner/api-helpers';
import { resolveProjectRoot } from '@/lib/runner/runner-validation';
import { assertRunAllowed, getRunnerRuntimeConfig } from '@/lib/runner/runner-config';
import { startRun } from '@/lib/runner/taskmaster-runner';

export async function POST(request: NextRequest) {
   try {
      const { projectRoot, sandbox } = await parseRunnerBody(
         request,
         startLoopRequestSchema,
         'INVALID_PROJECT_ROOT'
      );
      const root = await resolveProjectRoot(projectRoot);
      const config = await getRunnerRuntimeConfig(root);
      const mode = sandbox ? 'loop-sandbox' : 'loop';
      assertRunAllowed(config, mode, root);
      const run = await startRun({ projectRoot: root, mode, config });
      return runnerSuccess({ runId: run.runId, run }, 201);
   } catch (error) {
      return runnerFailure(error);
   }
}
