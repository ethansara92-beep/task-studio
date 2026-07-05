import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SECRET_MASK } from '@/types/settings';
import { sendTestWebhook } from '@/lib/settings/webhook-delivery';
import { appendAuditLog, loadSettings } from '@/lib/settings/settings-service';

const bodySchema = z.object({
   /** Where to find the URL/secret. Masked values are resolved from storage. */
   target: z.enum(['endpoint', 'slack', 'discord', 'custom', 'url']),
   endpointId: z.string().max(50).optional(),
   url: z.string().max(2000).optional(),
   secret: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
   try {
      const body = bodySchema.safeParse(await request.json().catch(() => null));
      if (!body.success) {
         return NextResponse.json(
            {
               success: false,
               error: 'Invalid test-webhook request',
               timestamp: new Date().toISOString(),
            },
            { status: 400 }
         );
      }

      const settings = await loadSettings();
      let url = body.data.url ?? '';
      let secret = body.data.secret ?? '';

      // Resolve masked/stored values server-side so secrets never round-trip.
      switch (body.data.target) {
         case 'slack':
            if (!url || url === SECRET_MASK) url = settings.notifications.slackWebhookUrl;
            break;
         case 'discord':
            if (!url || url === SECRET_MASK) url = settings.notifications.discordWebhookUrl;
            break;
         case 'custom':
            if (!url || url === SECRET_MASK) url = settings.integrations.custom.webhookUrl;
            break;
         case 'endpoint': {
            const endpoint = settings.webhooks.endpoints.find((e) => e.id === body.data.endpointId);
            if (!endpoint) {
               return NextResponse.json(
                  {
                     success: false,
                     error: 'Webhook endpoint not found - save it first',
                     timestamp: new Date().toISOString(),
                  },
                  { status: 404 }
               );
            }
            url = endpoint.url;
            secret = endpoint.secret;
            break;
         }
         case 'url':
            if (secret === SECRET_MASK) secret = '';
            break;
      }

      if (!url) {
         return NextResponse.json(
            {
               success: false,
               error: 'No webhook URL configured',
               timestamp: new Date().toISOString(),
            },
            { status: 400 }
         );
      }

      const result = await sendTestWebhook(url, secret, settings.webhooks.timeoutMs);
      await appendAuditLog(
         'validation.performed',
         `Test webhook sent (target: ${body.data.target}, ok: ${result.ok})`,
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
            error: error instanceof Error ? error.message : 'Test webhook failed',
            timestamp: new Date().toISOString(),
         },
         { status: 500 }
      );
   }
}
