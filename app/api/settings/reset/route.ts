import { NextResponse } from 'next/server';
import { appendAuditLog, maskSecrets, resetSettings } from '@/lib/settings/settings-service';

export async function POST() {
   try {
      const defaults = await resetSettings();
      await appendAuditLog('settings.reset', 'All settings reset to defaults');
      return NextResponse.json({
         success: true,
         data: maskSecrets(defaults),
         timestamp: new Date().toISOString(),
      });
   } catch (error) {
      return NextResponse.json(
         {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to reset settings',
            timestamp: new Date().toISOString(),
         },
         { status: 500 }
      );
   }
}
