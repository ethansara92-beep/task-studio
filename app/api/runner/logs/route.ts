import { NextRequest } from 'next/server';
import { runIdSchema } from '@/types/runner';
import { runnerFailure, runnerSuccess } from '@/lib/runner/api-helpers';
import { RunnerError, resolveProjectRoot } from '@/lib/runner/runner-validation';
import { getRunnerRuntimeConfig } from '@/lib/runner/runner-config';
import { readRunLog } from '@/lib/runner/taskmaster-runner';

export async function GET(request: NextRequest) {
   try {
      const params = request.nextUrl.searchParams;

      const runIdResult = runIdSchema.safeParse(params.get('runId'));
      if (!runIdResult.success) {
         throw new RunnerError('INVALID_RUN_ID', 'A valid runId query parameter is required', 400);
      }

      const projectRoot = params.get('projectRoot') ?? undefined;
      const root = await resolveProjectRoot(projectRoot);

      // Optional tail size in bytes (bounded server-side); defaults to the
      // configured max log size from Settings → Preferences.
      const maxBytesParam = params.get('maxBytes');
      let maxBytes = maxBytesParam ? parseInt(maxBytesParam, 10) : undefined;
      if (maxBytesParam && (!Number.isFinite(maxBytes) || maxBytes! <= 0)) {
         throw new RunnerError('INVALID_RUN_ID', 'maxBytes must be a positive integer', 400);
      }
      if (maxBytes === undefined) {
         const config = await getRunnerRuntimeConfig(root);
         maxBytes = config.maxLogResponseBytes;
      }

      const logs = await readRunLog(root, runIdResult.data, maxBytes);
      return runnerSuccess(logs);
   } catch (error) {
      return runnerFailure(error);
   }
}
