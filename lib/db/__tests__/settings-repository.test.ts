import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabaseAt } from '@/lib/db';
import {
   clearSettingsDoc,
   hasStoredSettings,
   loadSettingsDoc,
   saveSettingsDoc,
} from '@/lib/db/repositories/settings-repository';
import {
   getSettingsFilePath,
   loadSettings,
   resetSettings,
   saveSettings,
} from '@/lib/settings/settings-service';
import { createDefaultSettings } from '@/types/settings';

describe('settings repository', () => {
   let dir: string;
   let db: DatabaseSync;

   beforeEach(() => {
      dir = mkdtempSync(path.join(tmpdir(), 'tsdb-settings-'));
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

   it('roundtrips a settings document as section rows', () => {
      expect(hasStoredSettings(db)).toBe(false);
      expect(loadSettingsDoc(db)).toBeNull();

      const settings = createDefaultSettings();
      settings.workspace.name = 'DB Workspace';
      saveSettingsDoc(db, settings as unknown as Record<string, unknown>);

      expect(hasStoredSettings(db)).toBe(true);
      const doc = loadSettingsDoc(db);
      expect(doc).not.toBeNull();
      expect((doc!.workspace as { name: string }).name).toBe('DB Workspace');
      expect(doc!.version).toBe(1);
   });

   it('skips corrupt section rows instead of failing the whole load', () => {
      const settings = createDefaultSettings();
      saveSettingsDoc(db, settings as unknown as Record<string, unknown>);
      db.prepare('UPDATE app_settings SET value_json = ? WHERE id = ?').run('{broken', 'workspace');

      const doc = loadSettingsDoc(db);
      expect(doc).not.toBeNull();
      expect(doc!.workspace).toBeUndefined();
      expect(doc!.general).toBeDefined();
   });

   it('clearSettingsDoc removes every row', () => {
      saveSettingsDoc(db, createDefaultSettings() as unknown as Record<string, unknown>);
      clearSettingsDoc(db);
      expect(hasStoredSettings(db)).toBe(false);
   });
});

describe('settings service with SQLite primary store', () => {
   let root: string;
   const savedEnv = { TASKMASTER_DIR: process.env.TASKMASTER_DIR, USER_CWD: process.env.USER_CWD };

   beforeEach(() => {
      root = mkdtempSync(path.join(tmpdir(), 'tsdb-svc-'));
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

   it('reads from the database even when the JSON mirror is deleted', async () => {
      const settings = createDefaultSettings();
      settings.workspace.name = 'Persisted In DB';
      await saveSettings(settings);

      // The JSON mirror exists after save; deleting it must not lose settings.
      expect(existsSync(getSettingsFilePath())).toBe(true);
      unlinkSync(getSettingsFilePath());

      const loaded = await loadSettings();
      expect(loaded.workspace.name).toBe('Persisted In DB');
   });

   it('creates the database file next to the settings file', async () => {
      await saveSettings(createDefaultSettings());
      expect(existsSync(path.join(root, '.taskmaster', 'task-studio.sqlite'))).toBe(true);
   });

   it('reset restores defaults in the database store', async () => {
      const settings = createDefaultSettings();
      settings.workspace.name = 'Custom Name';
      await saveSettings(settings);

      const defaults = await resetSettings();
      expect(defaults.workspace.name).toBe('My Workspace');

      unlinkSync(getSettingsFilePath());
      const reloaded = await loadSettings();
      expect(reloaded.workspace.name).toBe('My Workspace');
   });
});
