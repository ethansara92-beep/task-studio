import { NextRequest } from 'next/server';
import { runnerFailure, runnerSuccess } from '@/lib/runner/api-helpers';
import { resolveProjectRoot } from '@/lib/runner/runner-validation';
import { getRunnerStatus } from '@/lib/runner/taskmaster-runner';

export async function GET(request: NextRequest) {
   try {
      const projectRoot = request.nextUrl.searchParams.get('projectRoot') ?? undefined;
      const root = await resolveProjectRoot(projectRoot);
      const status = await getRunnerStatus(root);
      return runnerSuccess(status);
   } catch (error) {
      return runnerFailure(error);
   }
}
