import crypto from 'node:crypto';
import { webhookUrlSchema, SECRET_MASK } from '@/types/settings';

export interface WebhookDeliveryResult {
   ok: boolean;
   status?: number;
   error?: string;
}

/**
 * Sends a small test payload to a webhook endpoint. Payloads are HMAC-signed
 * (sha256) when a secret is configured. URLs are restricted to https:// or
 * localhost http:// by webhookUrlSchema. Never includes logs or settings.
 */
export async function sendTestWebhook(
   url: string,
   secret: string,
   timeoutMs: number
): Promise<WebhookDeliveryResult> {
   const parsed = webhookUrlSchema.safeParse(url);
   if (!parsed.success || !url || url === SECRET_MASK) {
      return {
         ok: false,
         error: parsed.success ? 'URL is required' : parsed.error.errors[0].message,
      };
   }

   const payload = JSON.stringify({
      event: 'webhook.test',
      source: 'task-studio',
      sentAt: new Date().toISOString(),
   });

   const headers: Record<string, string> = { 'Content-Type': 'application/json' };
   if (secret && secret !== SECRET_MASK) {
      headers['X-TaskStudio-Signature'] =
         'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
   }

   const controller = new AbortController();
   const timer = setTimeout(() => controller.abort(), Math.min(Math.max(timeoutMs, 1000), 30000));

   try {
      const response = await fetch(url, {
         method: 'POST',
         headers,
         body: payload,
         signal: controller.signal,
      });
      if (response.ok) return { ok: true, status: response.status };
      return { ok: false, status: response.status, error: `Endpoint returned ${response.status}` };
   } catch (error) {
      if ((error as Error).name === 'AbortError') {
         return { ok: false, error: 'Request timed out' };
      }
      return { ok: false, error: error instanceof Error ? error.message : 'Delivery failed' };
   } finally {
      clearTimeout(timer);
   }
}
