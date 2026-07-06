import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { addProject, listProjects } from '@/lib/db/repositories/projects-repository';
import { appendAuditLog, loadSettings } from '@/lib/settings/settings-service';

/**
 * Project registry (SQLite-backed). Roots registered here are metadata for
 * the UI and future multi-project support; runner authorization still
 * enforces the server's single configured root on every run request.
 */

const addSchema = z.object({
   path: z.string().min(1).max(1000),
   name: z.string().min(1).max(100).optional(),
});

function errorResponse(error: unknown, fallback: string, status = 500) {
   return NextResponse.json(
      {
         success: false,
         error: error instanceof Error ? error.message : fallback,
         timestamp: new Date().toISOString(),
      },
      { status }
   );
}

export async function GET() {
   try {
      const db = getDb();
      return NextResponse.json({
         success: true,
         data: { projects: listProjects(db) },
         timestamp: new Date().toISOString(),
      });
   } catch (error) {
      return errorResponse(error, 'Failed to list projects');
   }
}

export async function POST(request: NextRequest) {
   try {
      const body = addSchema.safeParse(await request.json().catch(() => null));
      if (!body.success) {
         return errorResponse(new Error('A path field is required'), 'Invalid request', 400);
      }

      const db = getDb();
      const project = await addProject(db, { rootPath: body.data.path, name: body.data.name });
      const settings = await loadSettings();
      await appendAuditLog('project.added', `Project registered: ${project.rootPath}`, {
         enabled: settings.security.auditLog,
         projectRoot: project.rootPath,
      });

      return NextResponse.json({
         success: true,
         data: { project },
         timestamp: new Date().toISOString(),
      });
   } catch (error) {
      return errorResponse(error, 'Failed to add project');
   }
}
