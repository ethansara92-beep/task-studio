import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from '@/lib/db';

/**
 * Persists the settings document as one row per top-level section in
 * `app_settings` (id = section key, value_json = section JSON). The
 * settings-service owns validation; this module only stores and retrieves.
 */

const VERSION_ROW_ID = 'version';

function safeJsonParse(raw: string): unknown {
   try {
      return JSON.parse(raw);
   } catch {
      return undefined;
   }
}

/** True when at least one settings row exists (i.e. settings were migrated). */
export function hasStoredSettings(db: DatabaseSync): boolean {
   const row = db.prepare('SELECT COUNT(*) AS n FROM app_settings').get() as { n: number };
   return row.n > 0;
}

/**
 * Assembles the stored settings document from section rows. Returns null when
 * nothing is stored yet. Corrupt section rows are skipped (the service merges
 * over defaults, so a skipped section falls back to its defaults).
 */
export function loadSettingsDoc(db: DatabaseSync): Record<string, unknown> | null {
   const rows = db.prepare('SELECT id, value_json FROM app_settings').all() as unknown as Array<{
      id: string;
      value_json: string;
   }>;
   if (rows.length === 0) return null;

   const doc: Record<string, unknown> = {};
   for (const row of rows) {
      const value = safeJsonParse(row.value_json);
      if (value === undefined) continue;
      doc[row.id === VERSION_ROW_ID ? 'version' : row.id] = value;
   }
   return doc;
}

/**
 * Saves a validated settings document, one row per section, atomically.
 * The caller must pass an object that already passed schema validation.
 */
export function saveSettingsDoc(db: DatabaseSync, settings: Record<string, unknown>): void {
   const now = new Date().toISOString();
   const upsert = db.prepare(
      `INSERT INTO app_settings (id, value_json, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
   );

   withTransaction(db, () => {
      for (const [key, value] of Object.entries(settings)) {
         const rowId = key === 'version' ? VERSION_ROW_ID : key;
         upsert.run(rowId, JSON.stringify(value ?? null), now, now);
      }
   });
}

/** Removes every stored settings row (used by reset before writing defaults). */
export function clearSettingsDoc(db: DatabaseSync): void {
   db.prepare('DELETE FROM app_settings').run();
}
