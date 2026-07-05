import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateProjectRootPath } from '@/lib/settings/validate-tools';
import { appendAuditLog } from '@/lib/settings/settings-service';

const bodySchema = z.object({ path: z.string().min(1).max(1000) });

export async function POST(request: NextRequest) {
   try {
      const body = bodySchema.safeParse(await request.json().catch(() => null));
      if (!body.success) {
         return NextResponse.json(
            {
               success: false,
               error: 'A path field is required',
               timestamp: new Date().toISOString(),
            },
            { status: 400 }
         );
      }

      const result = await validateProjectRootPath(body.data.path);
      await appendAuditLog('validation.performed', `Project root validated (ok: ${result.ok})`);
      return NextResponse.json({
         success: true,
         data: result,
         timestamp: new Date().toISOString(),
      });
   } catch (error) {
      return NextResponse.json(
         {
            success: false,
            error: error instanceof Error ? error.message : 'Validation failed',
            timestamp: new Date().toISOString(),
         },
         { status: 500 }
      );
   }
}
