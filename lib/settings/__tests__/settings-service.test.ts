import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
   getSettingsFilePath,
   loadSettings,
   maskSecrets,
   mergeWithDefaults,
   resetSettings,
   restoreMaskedSecrets,
   saveSettings,
   stripSecretsForExport,
} from '../settings-service';
import { SECRET_MASK, createDefaultSettings, settingsSchema } from '@/types/settings';

describe('settings service', () => {
   let root: string;
   const savedEnv = { TASKMASTER_DIR: process.env.TASKMASTER_DIR, USER_CWD: process.env.USER_CWD };

   beforeEach(() => {
      root = mkdtempSync(path.join(tmpdir(), 'settings-'));
      mkdirSync(path.join(root, '.taskmaster'), { recursive: true });
      delete process.env.TASKMASTER_DIR;
      process.env.USER_CWD = root;
   });

   afterEach(() => {
      rmSync(root, { recursive: true, force: true });
      if (savedEnv.TASKMASTER_DIR !== undefined) {
         process.env.TASKMASTER_DIR = savedEnv.TASKMASTER_DIR;
      } else {
         delete process.env.TASKMASTER_DIR;
      }
      if (savedEnv.USER_CWD !== undefined) process.env.USER_CWD = savedEnv.USER_CWD;
      else delete process.env.USER_CWD;
   });

   it('returns seeded defaults when no file exists', async () => {
      const settings = await loadSettings();
      expect(settings.version).toBe(1);
      expect(settings.taskmaster.tmPath).toBe('tm');
      expect(settings.claude.claudePath).toBe('claude');
      expect(settings.labels.items.map((l) => l.name)).toContain('ai-run');
      expect(settings.templates.items.length).toBeGreaterThan(0);
   });

   it('deep-merges stored partial settings over defaults', async () => {
      writeFileSync(
         getSettingsFilePath(),
         JSON.stringify({ taskmaster: { tmPath: '/opt/bin/tm' }, runner: { historyLimit: 10 } })
      );
      const settings = await loadSettings();
      expect(settings.taskmaster.tmPath).toBe('/opt/bin/tm');
      expect(settings.runner.historyLimit).toBe(10);
      // Untouched values keep defaults.
      expect(settings.runner.logRetentionDays).toBe(14);
      expect(settings.preferences.theme).toBe('system');
   });

   it('backs up corrupted JSON and falls back to defaults', async () => {
      writeFileSync(getSettingsFilePath(), '{ this is not json');
      const settings = await loadSettings();
      expect(settings.taskmaster.tmPath).toBe('tm');
      const backups = readdirSync(path.join(root, '.taskmaster')).filter((f) =>
         f.includes('.corrupt-')
      );
      expect(backups.length).toBe(1);
   });

   it('backs up schema-invalid settings and falls back to defaults', async () => {
      writeFileSync(
         getSettingsFilePath(),
         JSON.stringify({ preferences: { taskRefreshIntervalMs: 999999 } })
      );
      const settings = await loadSettings();
      expect(settings.preferences.taskRefreshIntervalMs).toBe(1500);
      const backups = readdirSync(path.join(root, '.taskmaster')).filter((f) =>
         f.includes('.corrupt-')
      );
      expect(backups.length).toBe(1);
   });

   it('persists and reloads settings with timestamps', async () => {
      const settings = createDefaultSettings();
      settings.workspace.name = 'Test WS';
      await saveSettings(settings);
      const loaded = await loadSettings();
      expect(loaded.workspace.name).toBe('Test WS');
      expect(loaded.workspace.createdAt).not.toBe('');
      expect(loaded.workspace.updatedAt).not.toBe('');
   });

   it('reset writes a backup and restores defaults', async () => {
      const settings = createDefaultSettings();
      settings.workspace.name = 'Custom';
      await saveSettings(settings);
      const defaults = await resetSettings();
      expect(defaults.workspace.name).toBe('My Workspace');
      const backups = readdirSync(path.join(root, '.taskmaster')).filter((f) =>
         f.includes('pre-reset')
      );
      expect(backups.length).toBe(1);
      expect(existsSync(getSettingsFilePath())).toBe(true);
   });
});

describe('secret masking', () => {
   it('masks all secret fields and leaves empty ones empty', () => {
      const settings = createDefaultSettings();
      settings.notifications.slackWebhookUrl = 'https://hooks.slack.com/services/secret';
      settings.webhooks.endpoints = [
         {
            id: 'a',
            name: 'A',
            url: 'https://example.com/hook',
            secret: 'signing-key',
            enabled: true,
            events: [],
         },
      ];

      const masked = maskSecrets(settings);
      expect(masked.notifications.slackWebhookUrl).toBe(SECRET_MASK);
      expect(masked.notifications.discordWebhookUrl).toBe('');
      expect(masked.webhooks.endpoints[0].secret).toBe(SECRET_MASK);
      // Non-secret fields untouched.
      expect(masked.webhooks.endpoints[0].url).toBe('https://example.com/hook');
   });

   it('restores stored secrets when the mask sentinel is sent back', () => {
      const stored = createDefaultSettings();
      stored.notifications.slackWebhookUrl = 'https://hooks.slack.com/services/real';
      stored.webhooks.endpoints = [
         {
            id: 'a',
            name: 'A',
            url: 'https://x.com',
            secret: 'real-key',
            enabled: true,
            events: [],
         },
      ];

      const incoming = maskSecrets(stored);
      incoming.notifications.discordWebhookUrl = 'https://discord.com/api/webhooks/new';

      const restored = restoreMaskedSecrets(incoming, stored);
      expect(restored.notifications.slackWebhookUrl).toBe('https://hooks.slack.com/services/real');
      expect(restored.notifications.discordWebhookUrl).toBe('https://discord.com/api/webhooks/new');
      expect(restored.webhooks.endpoints[0].secret).toBe('real-key');
   });

   it('clears a secret when an empty value is sent', () => {
      const stored = createDefaultSettings();
      stored.notifications.slackWebhookUrl = 'https://hooks.slack.com/services/real';
      const incoming = maskSecrets(stored);
      incoming.notifications.slackWebhookUrl = '';
      const restored = restoreMaskedSecrets(incoming, stored);
      expect(restored.notifications.slackWebhookUrl).toBe('');
   });

   it('strips all secrets for export', () => {
      const settings = createDefaultSettings();
      settings.notifications.slackWebhookUrl = 'https://hooks.slack.com/x';
      settings.integrations.custom.webhookUrl = 'https://example.com/y';
      const exported = stripSecretsForExport(settings);
      expect(exported.notifications.slackWebhookUrl).toBe('');
      expect(exported.integrations.custom.webhookUrl).toBe('');
   });
});

describe('schema validation', () => {
   it('rejects out-of-range numbers', () => {
      const settings = createDefaultSettings();
      const bad = {
         ...settings,
         preferences: { ...settings.preferences, logRefreshIntervalMs: 50 },
      };
      expect(settingsSchema.safeParse(bad).success).toBe(false);
   });

   it('rejects invalid enum values', () => {
      const settings = createDefaultSettings() as Record<string, unknown>;
      const bad = { ...settings, preferences: { theme: 'neon' } };
      const merged = mergeWithDefaults(createDefaultSettings() as never, bad);
      expect(settingsSchema.safeParse(merged).success).toBe(false);
   });

   it('rejects bad env var keys and forbidden keys', () => {
      const settings = createDefaultSettings();
      const badKey = { ...settings, claude: { ...settings.claude, env: { 'lower-case': 'x' } } };
      expect(settingsSchema.safeParse(badKey).success).toBe(false);
      const forbidden = { ...settings, claude: { ...settings.claude, env: { PATH: '/evil' } } };
      expect(settingsSchema.safeParse(forbidden).success).toBe(false);
   });

   it('rejects non-localhost http webhook URLs and accepts https/localhost', () => {
      const settings = createDefaultSettings();
      const bad = {
         ...settings,
         notifications: { ...settings.notifications, slackWebhookUrl: 'http://evil.com/hook' },
      };
      expect(settingsSchema.safeParse(bad).success).toBe(false);

      const okHttps = {
         ...settings,
         notifications: { ...settings.notifications, slackWebhookUrl: 'https://evil.com/hook' },
      };
      expect(settingsSchema.safeParse(okHttps).success).toBe(true);

      const okLocal = {
         ...settings,
         notifications: {
            ...settings.notifications,
            slackWebhookUrl: 'http://localhost:3000/hook',
         },
      };
      expect(settingsSchema.safeParse(okLocal).success).toBe(true);
   });

   it('rejects shell-command-looking executable paths', () => {
      const settings = createDefaultSettings();
      const bad = { ...settings, taskmaster: { ...settings.taskmaster, tmPath: 'tm; rm -rf /' } };
      expect(settingsSchema.safeParse(bad).success).toBe(false);
      const okAbs = {
         ...settings,
         taskmaster: { ...settings.taskmaster, tmPath: '/opt/homebrew/bin/tm' },
      };
      expect(settingsSchema.safeParse(okAbs).success).toBe(true);
   });
});
