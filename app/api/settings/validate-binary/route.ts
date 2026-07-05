import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateBinary } from '@/lib/settings/validate-tools';
import { appendAuditLog, loadSettings } from '@/lib/settings/settings-service';

const bodySchema = z.object({
   tool: z.enum(['taskmaster', 'claude']),
   /** Optional unsaved path from the form; falls back to the stored setting. */
   path: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
   try {
      const body = bodySchema.safeParse(await request.json().catch(() => null));
      if (!body.success) {
         return NextResponse.json(
            {
               success: false,
               error: 'tool must be "taskmaster" or "claude"',
               timestamp: new Date().toISOString(),
            },
            { status: 400 }
         );
      }

      const settings = await loadSettings();
      const fallback =
         body.data.tool === 'taskmaster' ? settings.taskmaster.tmPath : settings.claude.claudePath;
      const executable = body.data.path?.trim() || fallback;

      const result = await validateBinary(executable);
      await appendAuditLog(
         'validation.performed',
         `${body.data.tool} binary validated (ok: ${result.ok})`,
         { enabled: settings.security.auditLog }
      );
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
