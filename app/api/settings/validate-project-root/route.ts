import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateProjectRootPath } from '@/lib/settings/validate-tools';
import { appendAuditLog } from '@/lib/settings/settings-service';
import { tryGetDb } from '@/lib/db';
import { getProjectByRoot } from '@/lib/db/repositories/projects-repository';

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

      // Persist the outcome on the registered project row, if one exists.
      if (result.normalizedRoot) {
         try {
            const db = tryGetDb();
            const project = db ? getProjectByRoot(db, result.normalizedRoot) : null;
            if (db && project) {
               db.prepare(
                  `UPDATE projects
                   SET is_valid = ?, validation_status = ?, validation_error = ?, updated_at = ?
                   WHERE id = ?`
               ).run(
                  result.ok ? 1 : 0,
                  result.ok ? 'valid' : 'invalid',
                  result.error ?? null,
                  new Date().toISOString(),
                  project.id
               );
            }
         } catch {
            // Validation status persistence is best-effort.
         }
      }

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
