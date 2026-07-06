// API client for the settings endpoints

import { TaskStudioSettings } from '@/types/settings';

export interface SettingsApiResponse<T = unknown> {
   success: boolean;
   data?: T;
   error?: string;
   timestamp: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<SettingsApiResponse<T>> {
   try {
      const response = await fetch(`/api/settings${path}`, {
         headers: { 'Content-Type': 'application/json' },
         ...init,
      });
      return await response.json();
   } catch (error) {
      return {
         success: false,
         error: error instanceof Error ? error.message : 'Settings request failed',
         timestamp: new Date().toISOString(),
      };
   }
}

export function fetchSettings() {
   return request<TaskStudioSettings>('');
}

export function saveSettings(settings: TaskStudioSettings) {
   return request<TaskStudioSettings>('', { method: 'POST', body: JSON.stringify(settings) });
}

export function resetSettings() {
   return request<TaskStudioSettings>('/reset', { method: 'POST' });
}

export interface ProjectRootValidation {
   ok: boolean;
   normalizedRoot?: string;
   error?: string;
}

export function validateProjectRoot(path: string) {
   return request<ProjectRootValidation>('/validate-project-root', {
      method: 'POST',
      body: JSON.stringify({ path }),
   });
}

export interface BinaryValidation {
   ok: boolean;
   version?: string;
   error?: string;
}

export function validateBinary(tool: 'taskmaster' | 'claude', path?: string) {
   return request<BinaryValidation>('/validate-binary', {
      method: 'POST',
      body: JSON.stringify({ tool, path }),
   });
}

export interface WebhookTestResult {
   ok: boolean;
   status?: number;
   error?: string;
}

export function testWebhook(body: {
   target: 'endpoint' | 'slack' | 'discord' | 'custom' | 'url';
   endpointId?: string;
   url?: string;
   secret?: string;
}) {
   return request<WebhookTestResult>('/test-webhook', {
      method: 'POST',
      body: JSON.stringify(body),
   });
}

export interface DatabaseDiagnostics {
   path: string;
   exists: boolean;
   available: boolean;
   sizeBytes: number | null;
   migrationVersion: number | null;
   projectCount: number | null;
   runCount: number | null;
   activeLockCount: number | null;
   error?: string;
}

export interface Diagnostics {
   appVersion: string;
   nodeVersion: string;
   platform: string;
   projectRoot: string;
   settingsFilePath: string;
   tasksFilePath: string;
   tasksFile: { exists: boolean; mtimeMs: number | null; sizeBytes: number | null };
   taskCache: {
      cachedTaskCount: number | null;
      cachedMtimeMs: number | null;
      inSync: boolean | null;
   };
   runsDirPath: string;
   taskmaster: { path: string; ok: boolean; version?: string; error?: string };
   claude: { path: string; ok: boolean; version?: string; error?: string };
   database: DatabaseDiagnostics;
}

export function fetchDiagnostics() {
   return request<Diagnostics>('/diagnostics');
}

export type MaintenanceAction =
   | 'clear-run-history'
   | 'clear-stale-lock'
   | 'clear-audit-log'
   | 'clear-notifications'
   | 'init-db'
   | 'vacuum-db'
   | 'backup-db';

export function runMaintenance(action: MaintenanceAction) {
   return request<{ detail: string }>('/maintenance', {
      method: 'POST',
      body: JSON.stringify({ action }),
   });
}
