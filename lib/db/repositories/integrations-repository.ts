import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from '@/lib/db';
import { SECRET_MASK, TaskStudioSettings } from '@/types/settings';

/**
 * Integration configuration mirror (github/gitlab/linear/custom). Edited via
 * Settings → Integrations; mirrored here on save for future relational
 * features. `config_json` never contains secrets - secret-bearing fields are
 * stripped and represented by `secret_masked` only.
 */

export interface IntegrationRecord {
   id: string;
   provider: string;
   enabled: boolean;
   config: unknown;
   secretMasked: string | null;
   createdAt: string;
   updatedAt: string;
}

export function syncIntegrationsFromSettings(db: DatabaseSync, settings: TaskStudioSettings): void {
   const now = new Date().toISOString();
   const { github, gitlab, linear, custom } = settings.integrations;

   const entries: Array<{ provider: string; enabled: boolean; config: unknown; hasSecret: boolean }> =
      [
         { provider: 'github', enabled: github.enabled, config: github, hasSecret: false },
         { provider: 'gitlab', enabled: gitlab.enabled, config: gitlab, hasSecret: false },
         { provider: 'linear', enabled: linear.enabled, config: linear, hasSecret: false },
         {
            provider: 'custom',
            enabled: custom.enabled,
            // The custom webhook URL is treated as a secret - never stored here.
            config: { ...custom, webhookUrl: undefined },
            hasSecret: Boolean(custom.webhookUrl),
         },
      ];

   const upsert = db.prepare(
      `INSERT INTO integrations (id, provider, enabled, config_json, secret_masked, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (provider) DO UPDATE SET
         enabled = excluded.enabled,
         config_json = excluded.config_json,
         secret_masked = excluded.secret_masked,
         updated_at = excluded.updated_at`
   );

   withTransaction(db, () => {
      for (const entry of entries) {
         upsert.run(
            crypto.randomUUID(),
            entry.provider,
            entry.enabled ? 1 : 0,
            JSON.stringify(entry.config ?? {}),
            entry.hasSecret ? SECRET_MASK : null,
            now,
            now
         );
      }
   });
}

export function listIntegrations(db: DatabaseSync): IntegrationRecord[] {
   const rows = db.prepare('SELECT * FROM integrations ORDER BY provider').all() as unknown as Array<{
      id: string;
      provider: string;
      enabled: number;
      config_json: string;
      secret_masked: string | null;
      created_at: string;
      updated_at: string;
   }>;
   return rows.map((row) => {
      let config: unknown = null;
      try {
         config = JSON.parse(row.config_json);
      } catch {
         // Corrupt config row; surface null.
      }
      return {
         id: row.id,
         provider: row.provider,
         enabled: row.enabled === 1,
         config,
         secretMasked: row.secret_masked,
         createdAt: row.created_at,
         updatedAt: row.updated_at,
      };
   });
}
