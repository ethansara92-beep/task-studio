import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getTaskmasterPath } from '@/lib/taskmaster-paths';
import { tryGetDb } from '@/lib/db';
import {
   clearSettingsDoc,
   loadSettingsDoc,
   saveSettingsDoc,
} from '@/lib/db/repositories/settings-repository';
import { syncProjectsFromSettings } from '@/lib/db/repositories/projects-repository';
import { syncWebhooksFromSettings } from '@/lib/db/repositories/webhooks-repository';
import { syncIntegrationsFromSettings } from '@/lib/db/repositories/integrations-repository';
import { addAuditEvent } from '@/lib/db/repositories/audit-repository';
import {
   SECRET_MASK,
   SETTINGS_VERSION,
   TaskStudioSettings,
   createDefaultSettings,
   settingsSchema,
} from '@/types/settings';

/**
 * Settings persistence.
 *
 * Primary store: the SQLite app database (`app_settings` table). The legacy
 * JSON file (`.taskmaster/task-studio-settings.json`) is still maintained as
 * a human-readable mirror on every save, imported once into SQLite when the
 * database is empty, and used as the full fallback store on Node runtimes
 * without `node:sqlite`. It is never deleted automatically.
 */

export const SETTINGS_FILE_NAME = 'task-studio-settings.json';
const AUDIT_FILE_NAME = 'task-studio-audit.log';
const AUDIT_MAX_BYTES = 512 * 1024;

export function getSettingsFilePath(): string {
   return path.join(getTaskmasterPath(), SETTINGS_FILE_NAME);
}

export function getAuditLogPath(): string {
   return path.join(getTaskmasterPath(), AUDIT_FILE_NAME);
}

/** Deep-merges a stored (possibly partial/stale) object over defaults. */
export function mergeWithDefaults<T extends Record<string, unknown>>(
   defaults: T,
   stored: unknown
): T {
   if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
      return defaults;
   }
   const result: Record<string, unknown> = { ...defaults };
   for (const [key, value] of Object.entries(stored)) {
      const defaultValue = (defaults as Record<string, unknown>)[key];
      if (
         typeof defaultValue === 'object' &&
         defaultValue !== null &&
         !Array.isArray(defaultValue) &&
         typeof value === 'object' &&
         value !== null &&
         !Array.isArray(value)
      ) {
         result[key] = mergeWithDefaults(defaultValue as Record<string, unknown>, value);
      } else if (value !== undefined) {
         result[key] = value;
      }
   }
   return result as T;
}

/**
 * Loads settings from the legacy JSON file. A missing file yields defaults;
 * a corrupted or schema-invalid file is backed up next to itself and
 * replaced by defaults.
 */
async function loadSettingsFromFile(): Promise<TaskStudioSettings> {
   const filePath = getSettingsFilePath();

   let raw: string;
   try {
      raw = await fs.readFile(filePath, 'utf-8');
   } catch {
      return createDefaultSettings();
   }

   let stored: unknown;
   try {
      stored = JSON.parse(raw);
   } catch {
      await backupCorruptedFile(filePath, raw);
      return createDefaultSettings();
   }

   const merged = mergeWithDefaults(
      createDefaultSettings() as unknown as Record<string, unknown>,
      stored
   );
   const parsed = settingsSchema.safeParse(merged);
   if (!parsed.success) {
      await backupCorruptedFile(filePath, raw);
      return createDefaultSettings();
   }
   parsed.data.version = SETTINGS_VERSION;
   return parsed.data;
}

/**
 * Loads settings. SQLite is the source of truth when available; when its
 * rows are empty the legacy JSON file is imported once (and kept on disk).
 */
export async function loadSettings(): Promise<TaskStudioSettings> {
   const db = tryGetDb();
   if (!db) return loadSettingsFromFile();

   let doc: Record<string, unknown> | null = null;
   try {
      doc = loadSettingsDoc(db);
   } catch {
      return loadSettingsFromFile();
   }

   if (doc === null) {
      // First run with a database: import the legacy file (or defaults).
      const fromFile = await loadSettingsFromFile();
      try {
         saveSettingsDoc(db, fromFile as unknown as Record<string, unknown>);
      } catch {
         // Import is best-effort; the file remains the fallback.
      }
      return fromFile;
   }

   const merged = mergeWithDefaults(
      createDefaultSettings() as unknown as Record<string, unknown>,
      doc
   );
   const parsed = settingsSchema.safeParse(merged);
   if (!parsed.success) {
      // Stored rows are kept for inspection; runtime falls back to defaults.
      return createDefaultSettings();
   }
   parsed.data.version = SETTINGS_VERSION;
   return parsed.data;
}

async function backupCorruptedFile(filePath: string, raw: string): Promise<void> {
   try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fs.writeFile(`${filePath}.corrupt-${stamp}.bak`, raw, 'utf-8');
   } catch {
      // Backup is best-effort.
   }
}

/** Atomically writes the human-readable JSON mirror of the settings. */
async function writeSettingsFile(settings: TaskStudioSettings): Promise<void> {
   const filePath = getSettingsFilePath();
   await fs.mkdir(path.dirname(filePath), { recursive: true });
   const tmpPath = `${filePath}.tmp`;
   await fs.writeFile(tmpPath, JSON.stringify(settings, null, 2), 'utf-8');
   await fs.rename(tmpPath, filePath);
}

/**
 * Persists validated settings (SQLite + JSON mirror) and stamps
 * workspace.updatedAt. Also mirrors projects/webhooks/integrations into
 * their relational tables so future features can query them directly.
 */
export async function saveSettings(settings: TaskStudioSettings): Promise<TaskStudioSettings> {
   const now = new Date().toISOString();
   settings.workspace.updatedAt = now;
   if (!settings.workspace.createdAt) settings.workspace.createdAt = now;
   settings.version = SETTINGS_VERSION;

   const db = tryGetDb();
   if (db) {
      saveSettingsDoc(db, settings as unknown as Record<string, unknown>);
      // Relational mirrors are best-effort - settings rows are already saved.
      try {
         syncProjectsFromSettings(db, settings);
         syncWebhooksFromSettings(db, settings);
         syncIntegrationsFromSettings(db, settings);
      } catch {
         // Mirror sync failures never block a settings save.
      }
   }

   await writeSettingsFile(settings);
   return settings;
}

/** Backs up the current settings file (used before import/reset). */
export async function backupSettings(reason: string): Promise<string | null> {
   const filePath = getSettingsFilePath();
   try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${filePath}.${reason}-${stamp}.bak`;
      await fs.writeFile(backupPath, raw, 'utf-8');
      return backupPath;
   } catch {
      return null;
   }
}

export async function resetSettings(): Promise<TaskStudioSettings> {
   await backupSettings('pre-reset');
   const db = tryGetDb();
   if (db) {
      try {
         clearSettingsDoc(db);
      } catch {
         // saveSettings below overwrites the rows anyway.
      }
   }
   const defaults = createDefaultSettings();
   return saveSettings(defaults);
}

// --- Secrets ---------------------------------------------------------------

function maskValue(value: string): string {
   return value ? SECRET_MASK : '';
}

/**
 * Returns a deep copy with all secret fields masked. This is the only shape
 * that ever leaves the server.
 */
export function maskSecrets(settings: TaskStudioSettings): TaskStudioSettings {
   const copy: TaskStudioSettings = JSON.parse(JSON.stringify(settings));
   copy.notifications.slackWebhookUrl = maskValue(copy.notifications.slackWebhookUrl);
   copy.notifications.discordWebhookUrl = maskValue(copy.notifications.discordWebhookUrl);
   copy.integrations.custom.webhookUrl = maskValue(copy.integrations.custom.webhookUrl);
   copy.webhooks.endpoints = copy.webhooks.endpoints.map((endpoint) => ({
      ...endpoint,
      secret: maskValue(endpoint.secret),
   }));
   return copy;
}

/**
 * Restores stored secret values wherever the incoming settings carry the
 * mask sentinel (meaning "unchanged").
 */
export function restoreMaskedSecrets(
   incoming: TaskStudioSettings,
   stored: TaskStudioSettings
): TaskStudioSettings {
   const result: TaskStudioSettings = JSON.parse(JSON.stringify(incoming));
   if (result.notifications.slackWebhookUrl === SECRET_MASK) {
      result.notifications.slackWebhookUrl = stored.notifications.slackWebhookUrl;
   }
   if (result.notifications.discordWebhookUrl === SECRET_MASK) {
      result.notifications.discordWebhookUrl = stored.notifications.discordWebhookUrl;
   }
   if (result.integrations.custom.webhookUrl === SECRET_MASK) {
      result.integrations.custom.webhookUrl = stored.integrations.custom.webhookUrl;
   }
   result.webhooks.endpoints = result.webhooks.endpoints.map((endpoint) => {
      if (endpoint.secret === SECRET_MASK) {
         const previous = stored.webhooks.endpoints.find((e) => e.id === endpoint.id);
         return { ...endpoint, secret: previous?.secret ?? '' };
      }
      return endpoint;
   });
   return result;
}

/** Export copy with secrets stripped entirely (never written to exports). */
export function stripSecretsForExport(settings: TaskStudioSettings): TaskStudioSettings {
   const copy: TaskStudioSettings = JSON.parse(JSON.stringify(settings));
   copy.notifications.slackWebhookUrl = '';
   copy.notifications.discordWebhookUrl = '';
   copy.integrations.custom.webhookUrl = '';
   copy.webhooks.endpoints = copy.webhooks.endpoints.map((e) => ({ ...e, secret: '' }));
   return copy;
}

// --- Audit log ---------------------------------------------------------------

export type AuditEvent =
   | 'settings.updated'
   | 'settings.reset'
   | 'settings.imported'
   | 'project.added'
   | 'project.removed'
   | 'project.validated'
   | 'runner.started'
   | 'runner.stopped'
   | 'runner.completed'
   | 'runner.failed'
   | 'runner.cancelled'
   | 'runner.lock_cleared'
   | 'webhook.tested'
   | 'integration.updated'
   | 'taskcache.refreshed'
   | 'validation.performed'
   | 'maintenance.performed';

export interface AuditContext {
   enabled?: boolean;
   projectRoot?: string;
   taskId?: string | null;
   runId?: string | null;
}

/**
 * Records an audit event. Written to the `audit_events` table when the
 * database is available, otherwise appended to the legacy JSONL log. Only
 * event names and non-sensitive details are recorded - never setting values
 * or secrets.
 */
export async function appendAuditLog(
   event: AuditEvent,
   detail: string,
   options?: AuditContext
): Promise<void> {
   if (options?.enabled === false) return;

   const db = tryGetDb();
   if (db) {
      try {
         addAuditEvent(db, {
            eventType: event,
            message: detail,
            projectRoot: options?.projectRoot ?? null,
            taskId: options?.taskId ?? null,
            runId: options?.runId ?? null,
         });
         return;
      } catch {
         // Fall through to the file-based log.
      }
   }

   try {
      const line = `${JSON.stringify({ at: new Date().toISOString(), event, detail })}\n`;
      const auditPath = getAuditLogPath();
      await fs.mkdir(path.dirname(auditPath), { recursive: true });
      // Simple size cap: truncate once the log grows too large.
      try {
         const { size } = await fs.stat(auditPath);
         if (size > AUDIT_MAX_BYTES) await fs.writeFile(auditPath, line, 'utf-8');
         else await fs.appendFile(auditPath, line, 'utf-8');
      } catch {
         await fs.writeFile(auditPath, line, 'utf-8');
      }
   } catch {
      // Audit logging must never break the main flow.
   }
}
