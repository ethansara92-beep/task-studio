import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabaseAt } from '@/lib/db';
import {
   addProject,
   getProjectByRoot,
   listProjects,
   removeProject,
   revalidateProject,
   setDefaultProject,
   syncProjectsFromSettings,
} from '@/lib/db/repositories/projects-repository';
import {
   listWebhookDeliveries,
   listWebhooks,
   recordWebhookDelivery,
   syncWebhooksFromSettings,
   updateWebhookTestResult,
} from '@/lib/db/repositories/webhooks-repository';
import {
   addNotification,
   clearNotifications,
   listNotifications,
   markNotificationRead,
} from '@/lib/db/repositories/notifications-repository';
import {
   addAuditEvent,
   clearAuditEvents,
   listAuditEvents,
} from '@/lib/db/repositories/audit-repository';
import {
   listIntegrations,
   syncIntegrationsFromSettings,
} from '@/lib/db/repositories/integrations-repository';
import { SECRET_MASK, createDefaultSettings } from '@/types/settings';

describe('projects repository', () => {
   let dir: string;
   let db: DatabaseSync;

   function makeTaskmasterProject(name: string): string {
      const root = path.join(dir, name);
      mkdirSync(path.join(root, '.taskmaster', 'tasks'), { recursive: true });
      writeFileSync(
         path.join(root, '.taskmaster', 'tasks', 'tasks.json'),
         JSON.stringify({ master: { tasks: [] } })
      );
      return root;
   }

   beforeEach(() => {
      dir = mkdtempSync(path.join(tmpdir(), 'tsdb-proj-'));
      db = openDatabaseAt(path.join(dir, 'app.sqlite'));
   });

   afterEach(() => {
      try {
         db.close();
      } catch {
         // Already closed.
      }
      rmSync(dir, { recursive: true, force: true });
   });

   it('adds a valid project root and lists it', async () => {
      const root = makeTaskmasterProject('proj-a');
      const project = await addProject(db, { rootPath: root });
      expect(project.isValid).toBe(true);
      expect(project.validationStatus).toBe('valid');
      expect(listProjects(db).map((p) => p.rootPath)).toContain(root);
   });

   it('marks a root without tasks.json invalid instead of rejecting it', async () => {
      const root = path.join(dir, 'not-a-project');
      mkdirSync(root, { recursive: true });
      const project = await addProject(db, { rootPath: root });
      expect(project.isValid).toBe(false);
      expect(project.validationError).toMatch(/tasks\.json/);
   });

   it('enforces unique roots (re-adding refreshes instead of duplicating)', async () => {
      const root = makeTaskmasterProject('proj-b');
      await addProject(db, { rootPath: root });
      await addProject(db, { rootPath: root });
      expect(listProjects(db).filter((p) => p.rootPath === root).length).toBe(1);
   });

   it('sets exactly one default project', async () => {
      const a = await addProject(db, { rootPath: makeTaskmasterProject('proj-c') });
      const b = await addProject(db, { rootPath: makeTaskmasterProject('proj-d') });

      setDefaultProject(db, a.id);
      setDefaultProject(db, b.id);
      const defaults = listProjects(db).filter((p) => p.isDefault);
      expect(defaults.length).toBe(1);
      expect(defaults[0].id).toBe(b.id);
   });

   it('revalidates when the tasks file disappears', async () => {
      const root = makeTaskmasterProject('proj-e');
      const project = await addProject(db, { rootPath: root });
      expect(project.isValid).toBe(true);

      rmSync(path.join(root, '.taskmaster'), { recursive: true, force: true });
      const revalidated = await revalidateProject(db, project.id);
      expect(revalidated?.isValid).toBe(false);
   });

   it('removes a project', async () => {
      const project = await addProject(db, { rootPath: makeTaskmasterProject('proj-f') });
      expect(removeProject(db, project.id)).toBe(true);
      expect(getProjectByRoot(db, project.rootPath)).toBeNull();
   });

   it('syncs settings project roots without deleting registry-only rows', async () => {
      const apiRoot = makeTaskmasterProject('proj-api');
      await addProject(db, { rootPath: apiRoot });

      const settings = createDefaultSettings();
      const settingsRoot = makeTaskmasterProject('proj-settings');
      settings.projects.items = [
         {
            root: settingsRoot,
            runnerEnabled: true,
            defaultRunnerMode: 'run-task',
            sandboxPreferred: false,
            maxConcurrentRuns: 1,
            tmPathOverride: '',
            claudePathOverride: '',
            env: {},
         },
      ];
      settings.projects.defaultRoot = settingsRoot;
      syncProjectsFromSettings(db, settings);

      const roots = listProjects(db).map((p) => p.rootPath);
      expect(roots).toContain(apiRoot);
      expect(roots).toContain(settingsRoot);
      expect(getProjectByRoot(db, settingsRoot)?.isDefault).toBe(true);
   });
});

describe('webhooks, notifications, integrations, audit', () => {
   let dir: string;
   let db: DatabaseSync;

   beforeEach(() => {
      dir = mkdtempSync(path.join(tmpdir(), 'tsdb-misc-'));
      db = openDatabaseAt(path.join(dir, 'app.sqlite'));
   });

   afterEach(() => {
      try {
         db.close();
      } catch {
         // Already closed.
      }
      rmSync(dir, { recursive: true, force: true });
   });

   it('mirrors webhook endpoints WITHOUT ever storing the raw secret', () => {
      const settings = createDefaultSettings();
      settings.webhooks.endpoints = [
         {
            id: 'hook-1',
            name: 'CI hook',
            url: 'https://example.com/hook',
            secret: 'super-secret-signing-key',
            enabled: true,
            events: ['runner.completed'],
         },
      ];
      syncWebhooksFromSettings(db, settings);

      const rows = listWebhooks(db);
      expect(rows.length).toBe(1);
      expect(rows[0].secretMasked).toBe(SECRET_MASK);

      // The raw secret must not exist anywhere in the webhooks table.
      const raw = db.prepare('SELECT * FROM webhooks').all() as Array<Record<string, unknown>>;
      expect(JSON.stringify(raw)).not.toContain('super-secret-signing-key');
   });

   it('removes deleted endpoints and cascades their delivery history', () => {
      const settings = createDefaultSettings();
      settings.webhooks.endpoints = [
         { id: 'hook-1', name: 'A', url: 'https://a.example', secret: '', enabled: true, events: [] },
      ];
      syncWebhooksFromSettings(db, settings);
      recordWebhookDelivery(db, {
         webhookId: 'hook-1',
         eventType: 'webhook.test',
         status: 'delivered',
         responseStatus: 200,
      });
      expect(listWebhookDeliveries(db, 'hook-1').length).toBe(1);

      settings.webhooks.endpoints = [];
      syncWebhooksFromSettings(db, settings);
      expect(listWebhooks(db).length).toBe(0);
      const orphaned = db.prepare('SELECT COUNT(*) AS n FROM webhook_deliveries').get() as {
         n: number;
      };
      expect(orphaned.n).toBe(0);
   });

   it('records test outcomes on the webhook row', () => {
      const settings = createDefaultSettings();
      settings.webhooks.endpoints = [
         { id: 'hook-1', name: 'A', url: 'https://a.example', secret: '', enabled: true, events: [] },
      ];
      syncWebhooksFromSettings(db, settings);

      updateWebhookTestResult(db, 'hook-1', { ok: false, error: 'timeout' });
      const hook = listWebhooks(db)[0];
      expect(hook.lastStatus).toBe('failed');
      expect(hook.lastError).toBe('timeout');
      expect(hook.lastTestedAt).not.toBeNull();
   });

   it('stores, lists, reads and clears notifications', () => {
      addNotification(db, { type: 'runner', title: 'Run completed', message: 'run-1 done' });
      addNotification(db, { type: 'runner', title: 'Run failed' });

      let all = listNotifications(db);
      expect(all.length).toBe(2);
      expect(listNotifications(db, { unreadOnly: true }).length).toBe(2);

      expect(markNotificationRead(db, all[0].id)).toBe(true);
      expect(listNotifications(db, { unreadOnly: true }).length).toBe(1);

      expect(clearNotifications(db)).toBe(2);
      all = listNotifications(db);
      expect(all.length).toBe(0);
   });

   it('mirrors integrations with secrets stripped from config_json', () => {
      const settings = createDefaultSettings();
      settings.integrations.github.enabled = true;
      settings.integrations.github.repoUrl = 'https://github.com/acme/repo';
      settings.integrations.custom.enabled = true;
      settings.integrations.custom.webhookUrl = 'https://hooks.example.com/secret-path';
      syncIntegrationsFromSettings(db, settings);

      const rows = listIntegrations(db);
      const github = rows.find((r) => r.provider === 'github');
      expect(github?.enabled).toBe(true);

      const custom = rows.find((r) => r.provider === 'custom');
      expect(custom?.secretMasked).toBe(SECRET_MASK);
      const rawTable = db.prepare('SELECT * FROM integrations').all();
      expect(JSON.stringify(rawTable)).not.toContain('secret-path');
   });

   it('stores and clears audit events with run context', () => {
      addAuditEvent(db, {
         eventType: 'runner.completed',
         projectRoot: '/tmp/p',
         runId: 'run-1',
         message: 'Run run-1 completed',
      });
      const events = listAuditEvents(db);
      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe('runner.completed');
      expect(events[0].runId).toBe('run-1');

      expect(clearAuditEvents(db)).toBe(1);
      expect(listAuditEvents(db).length).toBe(0);
   });
});
