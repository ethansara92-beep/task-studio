import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getTaskmasterPath } from '@/lib/taskmaster-paths';
import {
   SECRET_MASK,
   SETTINGS_VERSION,
   TaskStudioSettings,
   createDefaultSettings,
   settingsSchema,
} from '@/types/settings';

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
 * Loads settings from disk. A missing file yields defaults; a corrupted or
 * schema-invalid file is backed up next to itself and replaced by defaults.
 */
export async function loadSettings(): Promise<TaskStudioSettings> {
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

async function backupCorruptedFile(filePath: string, raw: string): Promise<void> {
   try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fs.writeFile(`${filePath}.corrupt-${stamp}.bak`, raw, 'utf-8');
   } catch {
      // Backup is best-effort.
   }
}

/** Atomically persists validated settings and stamps workspace.updatedAt. */
export async function saveSettings(settings: TaskStudioSettings): Promise<TaskStudioSettings> {
   const filePath = getSettingsFilePath();
   await fs.mkdir(path.dirname(filePath), { recursive: true });

   const now = new Date().toISOString();
   settings.workspace.updatedAt = now;
   if (!settings.workspace.createdAt) settings.workspace.createdAt = now;
   settings.version = SETTINGS_VERSION;

   const tmpPath = `${filePath}.tmp`;
   await fs.writeFile(tmpPath, JSON.stringify(settings, null, 2), 'utf-8');
   await fs.rename(tmpPath, filePath);
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
   | 'runner.started'
   | 'runner.stopped'
   | 'validation.performed'
   | 'maintenance.performed';

/**
 * Appends a line to the local audit log (JSONL). Only event names and
 * non-sensitive details are recorded - never setting values or secrets.
 */
export async function appendAuditLog(
   event: AuditEvent,
   detail: string,
   options?: { enabled?: boolean }
): Promise<void> {
   if (options?.enabled === false) return;
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
