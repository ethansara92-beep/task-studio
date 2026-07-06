import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import {
   getProjectById,
   removeProject,
   revalidateProject,
   setDefaultProject,
   touchLastOpened,
} from '@/lib/db/repositories/projects-repository';
import { appendAuditLog, loadSettings } from '@/lib/settings/settings-service';

const patchSchema = z.object({
   action: z.enum(['set-default', 'validate', 'touch-opened']),
});

const idSchema = z.string().uuid();

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

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
   try {
      const { id } = await context.params;
      if (!idSchema.safeParse(id).success) {
         return errorResponse(new Error('Invalid project id'), 'Invalid project id', 400);
      }
      const body = patchSchema.safeParse(await request.json().catch(() => null));
      if (!body.success) {
         return errorResponse(new Error('Unknown project action'), 'Invalid request', 400);
      }

      const db = getDb();
      const project = getProjectById(db, id);
      if (!project) {
         return errorResponse(new Error('Project not found'), 'Project not found', 404);
      }

      const settings = await loadSettings();
      let updated = project;

      switch (body.data.action) {
         case 'set-default':
            updated = setDefaultProject(db, id) ?? project;
            break;
         case 'validate': {
            updated = (await revalidateProject(db, id)) ?? project;
            await appendAuditLog(
               'project.validated',
               `Project validated (ok: ${updated.isValid}): ${updated.rootPath}`,
               { enabled: settings.security.auditLog, projectRoot: updated.rootPath }
            );
            break;
         }
         case 'touch-opened':
            touchLastOpened(db, project.rootPath);
            updated = getProjectById(db, id) ?? project;
            break;
      }

      return NextResponse.json({
         success: true,
         data: { project: updated },
         timestamp: new Date().toISOString(),
      });
   } catch (error) {
      return errorResponse(error, 'Failed to update project');
   }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
   try {
      const { id } = await context.params;
      if (!idSchema.safeParse(id).success) {
         return errorResponse(new Error('Invalid project id'), 'Invalid project id', 400);
      }

      const db = getDb();
      const project = getProjectById(db, id);
      if (!project) {
         return errorResponse(new Error('Project not found'), 'Project not found', 404);
      }

      removeProject(db, id);
      const settings = await loadSettings();
      await appendAuditLog('project.removed', `Project removed: ${project.rootPath}`, {
         enabled: settings.security.auditLog,
         projectRoot: project.rootPath,
      });

      return NextResponse.json({
         success: true,
         data: { removed: true },
         timestamp: new Date().toISOString(),
      });
   } catch (error) {
      return errorResponse(error, 'Failed to remove project');
   }
}
