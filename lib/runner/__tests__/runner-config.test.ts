import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { assertRunAllowed, getRunnerRuntimeConfig } from '../runner-config';
import { RunnerError } from '../runner-validation';
import { createDefaultSettings } from '@/types/settings';

describe('runner runtime config', () => {
   let root: string;
   const savedEnv = {
      TASKMASTER_DIR: process.env.TASKMASTER_DIR,
      USER_CWD: process.env.USER_CWD,
      TASKMASTER_RUNNER_BIN: process.env.TASKMASTER_RUNNER_BIN,
   };

   const writeSettings = (mutate: (s: ReturnType<typeof createDefaultSettings>) => void) => {
      const settings = createDefaultSettings();
      mutate(settings);
      writeFileSync(
         path.join(root, '.taskmaster', 'task-studio-settings.json'),
         JSON.stringify(settings)
      );
   };

   beforeEach(() => {
      root = mkdtempSync(path.join(tmpdir(), 'runner-config-'));
      mkdirSync(path.join(root, '.taskmaster', 'tasks'), { recursive: true });
      delete process.env.TASKMASTER_DIR;
      delete process.env.TASKMASTER_RUNNER_BIN;
      process.env.USER_CWD = root;
   });

   afterEach(() => {
      rmSync(root, { recursive: true, force: true });
      for (const [key, value] of Object.entries(savedEnv)) {
         if (value !== undefined) process.env[key] = value;
         else delete process.env[key];
      }
   });

   it('uses the configured tm path from settings', async () => {
      writeSettings((s) => {
         s.taskmaster.tmPath = '/custom/bin/tm';
      });
      const config = await getRunnerRuntimeConfig(root);
      expect(config.tmBin).toBe('/custom/bin/tm');
   });

   it('lets the TASKMASTER_RUNNER_BIN env override settings', async () => {
      writeSettings((s) => {
         s.taskmaster.tmPath = '/custom/bin/tm';
      });
      process.env.TASKMASTER_RUNNER_BIN = '/env/tm';
      const config = await getRunnerRuntimeConfig(root);
      expect(config.tmBin).toBe('/env/tm');
   });

   it('prefers a per-project tm override over the global setting', async () => {
      writeSettings((s) => {
         s.taskmaster.tmPath = '/global/tm';
         s.projects.items = [
            {
               root,
               runnerEnabled: true,
               defaultRunnerMode: 'run-task',
               sandboxPreferred: false,
               maxConcurrentRuns: 1,
               tmPathOverride: '/project/tm',
               claudePathOverride: '',
               env: {},
            },
         ];
      });
      const config = await getRunnerRuntimeConfig(root);
      expect(config.tmBin).toBe('/project/tm');
   });

   it('passes no custom env when the policy is none', async () => {
      writeSettings((s) => {
         s.security.envPolicy = 'none';
         s.claude.env = { MY_VAR: 'x' };
      });
      const config = await getRunnerRuntimeConfig(root);
      expect(config.extraEnv).toEqual({});
   });

   it('merges claude env when the policy allows it', async () => {
      writeSettings((s) => {
         s.claude.env = { MY_VAR: 'x' };
      });
      const config = await getRunnerRuntimeConfig(root);
      expect(config.extraEnv.MY_VAR).toBe('x');
   });

   it('blocks runs when the runner is disabled', async () => {
      writeSettings((s) => {
         s.runner.enabled = false;
      });
      const config = await getRunnerRuntimeConfig(root);
      expect(() => assertRunAllowed(config, 'run-task', root)).toThrow(RunnerError);
      try {
         assertRunAllowed(config, 'run-task', root);
      } catch (error) {
         expect((error as RunnerError).code).toBe('RUNNER_DISABLED');
      }
   });

   it('blocks disallowed runner modes', async () => {
      writeSettings((s) => {
         s.security.allowedRunnerModes = ['run-task'];
      });
      const config = await getRunnerRuntimeConfig(root);
      expect(() => assertRunAllowed(config, 'run-task', root)).not.toThrow();
      try {
         assertRunAllowed(config, 'loop', root);
         throw new Error('should have thrown');
      } catch (error) {
         expect((error as RunnerError).code).toBe('MODE_NOT_ALLOWED');
      }
   });

   it('enforces the project root allowlist when set', async () => {
      writeSettings((s) => {
         s.general.projectRootAllowlist = ['/some/other/project'];
      });
      const config = await getRunnerRuntimeConfig(root);
      try {
         assertRunAllowed(config, 'run-task', root);
         throw new Error('should have thrown');
      } catch (error) {
         expect((error as RunnerError).code).toBe('INVALID_PROJECT_ROOT');
      }
   });

   it('allows runs when the root is allowlisted or the allowlist is empty', async () => {
      writeSettings((s) => {
         s.general.projectRootAllowlist = [root];
      });
      let config = await getRunnerRuntimeConfig(root);
      expect(() => assertRunAllowed(config, 'run-task', root)).not.toThrow();

      writeSettings((s) => {
         s.general.projectRootAllowlist = [];
      });
      config = await getRunnerRuntimeConfig(root);
      expect(() => assertRunAllowed(config, 'run-task', root)).not.toThrow();
   });
});
