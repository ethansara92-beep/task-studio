import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { TaskLoadError } from '@/lib/taskmaster/parse-taskmaster-tasks';
import {
   describeTasksFile,
   getTasksFilePath,
   resolveProjectRootFromConfig,
} from '@/lib/taskmaster/project-root';

const ENV_ROOT = '/srv/env-project';

describe('resolveProjectRootFromConfig', () => {
   const emptyConfig = { defaultProjectRoot: null, projectRootAllowlist: [] };

   it('falls back to the env root when nothing is configured', () => {
      expect(resolveProjectRootFromConfig(emptyConfig, ENV_ROOT)).toBe(path.resolve(ENV_ROOT));
   });

   it('uses the settings default project root when set', () => {
      const config = {
         defaultProjectRoot: '/srv/other-project',
         projectRootAllowlist: ['/srv/other-project'],
      };
      expect(resolveProjectRootFromConfig(config, ENV_ROOT)).toBe(
         path.resolve('/srv/other-project')
      );
   });

   it('accepts a requested root that equals the env root', () => {
      expect(resolveProjectRootFromConfig(emptyConfig, ENV_ROOT, ENV_ROOT)).toBe(
         path.resolve(ENV_ROOT)
      );
   });

   it('accepts a requested root from the allowlist', () => {
      const config = { defaultProjectRoot: null, projectRootAllowlist: ['/srv/allowed'] };
      expect(resolveProjectRootFromConfig(config, ENV_ROOT, '/srv/allowed')).toBe(
         path.resolve('/srv/allowed')
      );
   });

   it('rejects a requested root outside the allowlist with a typed 403', () => {
      try {
         resolveProjectRootFromConfig(emptyConfig, ENV_ROOT, '/srv/evil');
         expect.unreachable('should have thrown');
      } catch (error) {
         expect(error).toBeInstanceOf(TaskLoadError);
         expect((error as TaskLoadError).code).toBe('PROJECT_ROOT_NOT_ALLOWLISTED');
         expect((error as TaskLoadError).httpStatus).toBe(403);
      }
   });

   it('rejects traversal attempts that resolve outside allowed roots', () => {
      expect(() =>
         resolveProjectRootFromConfig(emptyConfig, ENV_ROOT, `${ENV_ROOT}/../sneaky`)
      ).toThrow(TaskLoadError);
   });

   it('normalizes an allowlisted path before comparing', () => {
      const config = { defaultProjectRoot: null, projectRootAllowlist: ['/srv/allowed/'] };
      expect(resolveProjectRootFromConfig(config, ENV_ROOT, '/srv/allowed')).toBe(
         path.resolve('/srv/allowed')
      );
   });
});

describe('describeTasksFile', () => {
   let dir: string;

   beforeEach(() => {
      dir = mkdtempSync(path.join(tmpdir(), 'ts-root-'));
   });

   afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
   });

   it('reports a missing tasks file with the expected canonical path', async () => {
      const info = await describeTasksFile(dir);
      expect(info.exists).toBe(false);
      expect(info.path).toBe(path.join(dir, '.taskmaster', 'tasks', 'tasks.json'));
      expect(info.mtimeMs).toBeNull();
   });

   it('reports an existing tasks file with mtime and size', async () => {
      mkdirSync(path.join(dir, '.taskmaster', 'tasks'), { recursive: true });
      writeFileSync(getTasksFilePath(dir), '{}');
      const info = await describeTasksFile(dir);
      expect(info.exists).toBe(true);
      expect(info.mtimeMs).toBeGreaterThan(0);
      expect(info.sizeBytes).toBe(2);
   });
});
