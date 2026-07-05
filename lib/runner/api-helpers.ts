import { NextResponse } from 'next/server';
import { ZodSchema } from 'zod';
import { RunnerApiResponse } from '@/types/runner';
import { RunnerError } from './runner-validation';

export function runnerSuccess<T>(data: T, status: number = 200) {
   return NextResponse.json<RunnerApiResponse<T>>(
      { success: true, data, timestamp: new Date().toISOString() },
      { status }
   );
}

export function runnerFailure(error: unknown) {
   if (error instanceof RunnerError) {
      return NextResponse.json<RunnerApiResponse>(
         {
            success: false,
            error: error.message,
            code: error.code,
            timestamp: new Date().toISOString(),
         },
         { status: error.httpStatus }
      );
   }

   console.error('Runner API error:', error);
   return NextResponse.json<RunnerApiResponse>(
      {
         success: false,
         error: error instanceof Error ? error.message : 'Internal server error',
         code: 'INTERNAL_ERROR',
         timestamp: new Date().toISOString(),
      },
      { status: 500 }
   );
}

/** Parses a JSON body against a schema, throwing a RunnerError on failure. */
export async function parseRunnerBody<T>(
   request: Request,
   schema: ZodSchema<T>,
   invalidCode: RunnerError['code'] = 'INVALID_TASK_ID'
): Promise<T> {
   let body: unknown;
   try {
      body = await request.json();
   } catch {
      throw new RunnerError(invalidCode, 'Request body must be valid JSON', 400);
   }

   const result = schema.safeParse(body);
   if (!result.success) {
      throw new RunnerError(invalidCode, result.error.errors[0].message, 400);
   }
   return result.data;
}
