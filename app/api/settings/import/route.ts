import { NextRequest, NextResponse } from 'next/server';
import { settingsSchema, createDefaultSettings } from '@/types/settings';
import {
   appendAuditLog,
   backupSettings,
   loadSettings,
   maskSecrets,
   mergeWithDefaults,
   restoreMaskedSecrets,
   saveSettings,
} from '@/lib/settings/settings-service';

/**
 * Imports a settings JSON document: the current file is backed up first,
 * the payload is validated against the full schema, and masked secret
 * sentinels keep the currently stored secrets.
 */
export async function POST(request: NextRequest) {
   try {
      let body: unknown;
      try {
         body = await request.json();
      } catch {
         return NextResponse.json(
            {
               success: false,
               error: 'Import file is not valid JSON',
               timestamp: new Date().toISOString(),
            },
            { status: 400 }
         );
      }

      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
         return NextResponse.json(
            {
               success: false,
               error: 'Import file must be a settings object',
               timestamp: new Date().toISOString(),
            },
            { status: 400 }
         );
      }

      const merged = mergeWithDefaults(
         createDefaultSettings() as unknown as Record<string, unknown>,
         body
      );
      const parsed = settingsSchema.safeParse(merged);
      if (!parsed.success) {
         const issue = parsed.error.errors[0];
         return NextResponse.json(
            {
               success: false,
               error: `Invalid settings: ${issue.path.join('.')}: ${issue.message}`,
               timestamp: new Date().toISOString(),
            },
            { status: 400 }
         );
      }

      const backupPath = await backupSettings('pre-import');
      const stored = await loadSettings();
      const saved = await saveSettings(restoreMaskedSecrets(parsed.data, stored));
      await appendAuditLog('settings.imported', 'Settings imported from file', {
         enabled: saved.security.auditLog,
      });

      return NextResponse.json({
         success: true,
         data: { settings: maskSecrets(saved), backupPath },
         timestamp: new Date().toISOString(),
      });
   } catch (error) {
      return NextResponse.json(
         {
            success: false,
            error: error instanceof Error ? error.message : 'Import failed',
            timestamp: new Date().toISOString(),
         },
         { status: 500 }
      );
   }
}
