import { NextRequest, NextResponse } from 'next/server';
import { settingsSchema, createDefaultSettings } from '@/types/settings';
import {
   appendAuditLog,
   loadSettings,
   maskSecrets,
   mergeWithDefaults,
   restoreMaskedSecrets,
   saveSettings,
} from '@/lib/settings/settings-service';

export async function GET() {
   try {
      const settings = await loadSettings();
      return NextResponse.json({
         success: true,
         data: maskSecrets(settings),
         timestamp: new Date().toISOString(),
      });
   } catch (error) {
      return NextResponse.json(
         {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to load settings',
            timestamp: new Date().toISOString(),
         },
         { status: 500 }
      );
   }
}

export async function POST(request: NextRequest) {
   try {
      let body: unknown;
      try {
         body = await request.json();
      } catch {
         return NextResponse.json(
            {
               success: false,
               error: 'Body must be valid JSON',
               timestamp: new Date().toISOString(),
            },
            { status: 400 }
         );
      }

      // Merge over defaults so partial payloads never wipe unknown sections,
      // then validate the full document.
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
               error: `${issue.path.join('.')}: ${issue.message}`,
               timestamp: new Date().toISOString(),
            },
            { status: 400 }
         );
      }

      const stored = await loadSettings();
      const withSecrets = restoreMaskedSecrets(parsed.data, stored);
      const saved = await saveSettings(withSecrets);
      await appendAuditLog('settings.updated', 'Settings saved from UI', {
         enabled: saved.security.auditLog,
      });

      return NextResponse.json({
         success: true,
         data: maskSecrets(saved),
         timestamp: new Date().toISOString(),
      });
   } catch (error) {
      return NextResponse.json(
         {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to save settings',
            timestamp: new Date().toISOString(),
         },
         { status: 500 }
      );
   }
}
