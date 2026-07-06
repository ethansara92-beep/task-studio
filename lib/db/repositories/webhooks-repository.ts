import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from '@/lib/db';
import { SECRET_MASK, TaskStudioSettings } from '@/types/settings';

/**
 * Webhook configuration mirror + delivery history.
 *
 * Endpoints are edited in Settings → Webhooks (stored in app_settings) and
 * mirrored here on every save so delivery history has a stable foreign key
 * and future features can query webhooks relationally.
 *
 * Secrets: this app has no OS keychain, so raw webhook secrets live only in
 * the settings document (git-ignored, masked in every API response) exactly
 * as before. This table stores `secret_masked` for display; `secret_encrypted`
 * stays NULL until real encryption exists. Raw secrets are NEVER stored here.
 */

export interface WebhookRecord {
   id: string;
   name: string;
   url: string;
   enabled: boolean;
   events: string[];
   secretMasked: string | null;
   lastTestedAt: string | null;
   lastStatus: string | null;
   lastError: string | null;
   createdAt: string;
   updatedAt: string;
}

interface WebhookRow {
   id: string;
   name: string;
   url: string;
   enabled: number;
   events_json: string;
   secret_masked: string | null;
   last_tested_at: string | null;
   last_status: string | null;
   last_error: string | null;
   created_at: string;
   updated_at: string;
}

function toRecord(row: WebhookRow): WebhookRecord {
   let events: string[] = [];
   try {
      const parsed = JSON.parse(row.events_json);
      if (Array.isArray(parsed)) events = parsed.filter((e): e is string => typeof e === 'string');
   } catch {
      // Keep empty on corrupt row.
   }
   return {
      id: row.id,
      name: row.name,
      url: row.url,
      enabled: row.enabled === 1,
      events,
      secretMasked: row.secret_masked,
      lastTestedAt: row.last_tested_at,
      lastStatus: row.last_status,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
   };
}

export function listWebhooks(db: DatabaseSync): WebhookRecord[] {
   const rows = db.prepare('SELECT * FROM webhooks ORDER BY name').all() as unknown as WebhookRow[];
   return rows.map(toRecord);
}

/**
 * Mirrors Settings → Webhooks endpoints into the table: upserts current
 * endpoints, deletes removed ones (cascading their delivery history).
 */
export function syncWebhooksFromSettings(db: DatabaseSync, settings: TaskStudioSettings): void {
   const now = new Date().toISOString();
   const endpoints = settings.webhooks.endpoints;

   const upsert = db.prepare(
      `INSERT INTO webhooks (id, name, url, enabled, events_json, secret_masked, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name,
         url = excluded.url,
         enabled = excluded.enabled,
         events_json = excluded.events_json,
         secret_masked = excluded.secret_masked,
         updated_at = excluded.updated_at`
   );

   withTransaction(db, () => {
      for (const endpoint of endpoints) {
         upsert.run(
            endpoint.id,
            endpoint.name,
            endpoint.url,
            endpoint.enabled ? 1 : 0,
            JSON.stringify(endpoint.events),
            endpoint.secret ? SECRET_MASK : null,
            now,
            now
         );
      }
      const keepIds = endpoints.map((e) => e.id);
      const existing = db.prepare('SELECT id FROM webhooks').all() as unknown as Array<{
         id: string;
      }>;
      const remove = db.prepare('DELETE FROM webhooks WHERE id = ?');
      for (const row of existing) {
         if (!keepIds.includes(row.id)) remove.run(row.id);
      }
   });
}

/** Persists a test/delivery outcome onto the webhook row. */
export function updateWebhookTestResult(
   db: DatabaseSync,
   webhookId: string,
   result: { ok: boolean; status?: number; error?: string }
): void {
   const now = new Date().toISOString();
   db.prepare(
      `UPDATE webhooks
       SET last_tested_at = ?, last_status = ?, last_error = ?, updated_at = ?
       WHERE id = ?`
   ).run(
      now,
      result.ok ? 'ok' : 'failed',
      result.error ?? null,
      now,
      webhookId
   );
}

// --- Delivery history ----------------------------------------------------------

export interface WebhookDeliveryInput {
   webhookId: string;
   eventType: string;
   status: 'delivered' | 'failed';
   /** Structured, non-sensitive request summary (never headers/secrets). */
   requestJson?: string | null;
   responseStatus?: number | null;
   responseBodyPreview?: string | null;
   error?: string | null;
   deliveredAt?: string | null;
}

/** Records a delivery attempt. No-ops when the webhook row does not exist. */
export function recordWebhookDelivery(db: DatabaseSync, input: WebhookDeliveryInput): boolean {
   const exists = db.prepare('SELECT 1 FROM webhooks WHERE id = ?').get(input.webhookId);
   if (!exists) return false;

   db.prepare(
      `INSERT INTO webhook_deliveries
         (id, webhook_id, event_type, status, request_json, response_status,
          response_body_preview, error, created_at, delivered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
   ).run(
      crypto.randomUUID(),
      input.webhookId,
      input.eventType,
      input.status,
      input.requestJson ?? null,
      input.responseStatus ?? null,
      input.responseBodyPreview?.slice(0, 1000) ?? null,
      input.error ?? null,
      new Date().toISOString(),
      input.deliveredAt ?? null
   );
   return true;
}

export interface WebhookDeliveryRecord {
   id: string;
   webhookId: string;
   eventType: string;
   status: string;
   responseStatus: number | null;
   error: string | null;
   createdAt: string;
   deliveredAt: string | null;
}

export function listWebhookDeliveries(
   db: DatabaseSync,
   webhookId: string,
   limit = 50
): WebhookDeliveryRecord[] {
   const rows = db
      .prepare(
         `SELECT id, webhook_id, event_type, status, response_status, error, created_at, delivered_at
          FROM webhook_deliveries WHERE webhook_id = ?
          ORDER BY created_at DESC LIMIT ?`
      )
      .all(webhookId, Math.min(Math.max(1, limit), 500)) as unknown as Array<{
      id: string;
      webhook_id: string;
      event_type: string;
      status: string;
      response_status: number | null;
      error: string | null;
      created_at: string;
      delivered_at: string | null;
   }>;
   return rows.map((row) => ({
      id: row.id,
      webhookId: row.webhook_id,
      eventType: row.event_type,
      status: row.status,
      responseStatus: row.response_status,
      error: row.error,
      createdAt: row.created_at,
      deliveredAt: row.delivered_at,
   }));
}
