import { NextRequest } from 'next/server';
import { runTaskRequestSchema } from '@/types/runner';
import { parseRunnerBody, runnerFailure, runnerSuccess } from '@/lib/runner/api-helpers';
import { RunnerError, resolveProjectRoot } from '@/lib/runner/runner-validation';
import { assertRunAllowed, getRunnerRuntimeConfig } from '@/lib/runner/runner-config';
import { checkTaskDependencies } from '@/lib/runner/next-task';
import { startRun } from '@/lib/runner/taskmaster-runner';

export async function POST(request: NextRequest) {
   try {
      const { taskId, projectRoot } = await parseRunnerBody(
         request,
         runTaskRequestSchema,
         'INVALID_TASK_ID'
      );
      const root = await resolveProjectRoot(projectRoot);
      const config = await getRunnerRuntimeConfig(root);
      assertRunAllowed(config, 'run-task', root);

      // Dependency policy from Settings → Workflow.
      let warning: string | undefined;
      if (config.dependencyBehavior !== 'ignore') {
         const deps = await checkTaskDependencies(root, taskId);
         if (!deps.complete) {
            const list = deps.incomplete.join(', ');
            if (config.dependencyBehavior === 'block') {
               throw new RunnerError(
                  'DEPENDENCIES_INCOMPLETE',
                  `Task ${taskId} has incomplete dependencies (${list}). ` +
                     'Complete them first, or change the dependency policy in Settings → Workflow.',
                  409
               );
            }
            warning = `Task ${taskId} has incomplete dependencies (${list}).`;
         }
      }

      const run = await startRun({ projectRoot: root, mode: 'run-task', taskId, config });
      return runnerSuccess({ runId: run.runId, taskId: run.taskId, run, warning }, 201);
   } catch (error) {
      return runnerFailure(error);
   }
}
