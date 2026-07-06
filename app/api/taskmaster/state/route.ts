import { NextResponse } from 'next/server';
import path from 'path';
import { readJsonFile } from '@/utils/filesystem';
import { resolveActiveProjectRoot } from '@/lib/taskmaster/project-root';

export async function GET() {
   try {
      // Read state.json from the active project's .taskmaster directory
      const projectRoot = await resolveActiveProjectRoot();
      const statePath = path.join(projectRoot, '.taskmaster', 'state.json');
      const result = await readJsonFile(statePath);

      if (!result.success) {
         return NextResponse.json(
            {
               success: false,
               error: result.error || 'Failed to read state.json',
               path: statePath,
               timestamp: new Date().toISOString(),
            },
            { status: 404 }
         );
      }

      return NextResponse.json({
         success: true,
         data: result.data,
         timestamp: new Date().toISOString(),
      });
   } catch (error) {
      return NextResponse.json(
         {
            success: false,
            error: error instanceof Error ? error.message : 'Internal server error',
            timestamp: new Date().toISOString(),
         },
         { status: 500 }
      );
   }
}
