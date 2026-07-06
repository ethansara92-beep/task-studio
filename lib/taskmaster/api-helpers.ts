import { NextResponse } from 'next/server';
import { TaskLoadError } from './parse-taskmaster-tasks';

/**
 * Uniform error responses for the taskmaster API routes. Every error carries
 * a machine-readable `code` so the UI can render a specific error state
 * instead of falling back to demo data.
 */
export function taskLoadErrorResponse(error: unknown): NextResponse {
   if (error instanceof TaskLoadError) {
      return NextResponse.json(
         {
            success: false,
            error: error.message,
            code: error.code,
            timestamp: new Date().toISOString(),
         },
         { status: error.httpStatus }
      );
   }

   console.error('Taskmaster API error:', error);
   return NextResponse.json(
      {
         success: false,
         error: error instanceof Error ? error.message : 'Internal server error',
         code: 'INTERNAL_ERROR',
         timestamp: new Date().toISOString(),
      },
      { status: 500 }
   );
}
