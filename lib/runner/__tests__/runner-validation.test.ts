import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
   RunnerError,
   buildRunnerCommand,
   getConfiguredProjectRoot,
   isValidRunId,
   isValidTaskId,
   resolveProjectRoot,
   resolveRunFilePath,
} from '../runner-validation';

describe('isValidTaskId', () => {
   it('accepts plain numeric IDs', () => {
      expect(isValidTaskId('1')).toBe(true);
      expect(isValidTaskId('12')).toBe(true);
   });

   it('accepts dotted subtask IDs', () => {
      expect(isValidTaskId('12.3')).toBe(true);
      expect(isValidTaskId('1.2.3')).toBe(true);
   });

   it('rejects shell metacharacters and injection attempts', () => {
      expect(isValidTaskId('12; rm -rf /')).toBe(false);
      expect(isValidTaskId('$(whoami)')).toBe(false);
      expect(isValidTaskId('12 && ls')).toBe(false);
      expect(isValidTaskId('--help')).toBe(false);
   });

   it('rejects empty, trailing-dot, and non-numeric IDs', () => {
      expect(isValidTaskId('')).toBe(false);
      expect(isValidTaskId('12.')).toBe(false);
      expect(isValidTaskId('.12')).toBe(false);
      expect(isValidTaskId('abc')).toBe(false);
      expect(isValidTaskId('user-auth-12')).toBe(false);
   });
});

describe('isValidRunId', () => {
   it('accepts generated-style run IDs', () => {
      expect(isValidRunId('2026-07-05T10-30-00-abc123')).toBe(true);
   });

   it('rejects path traversal attempts', () => {
      expect(isValidRunId('../../etc/passwd')).toBe(false);
      expect(isValidRunId('..')).toBe(false);
      expect(isValidRunId('foo/bar')).toBe(false);
      expect(isValidRunId('foo\\bar')).toBe(false);
      expect(isValidRunId('a.b')).toBe(false);
   });
});

describe('buildRunnerCommand', () => {
   it('builds tm start for run-task', () => {
      expect(buildRunnerCommand('run-task', '12')).toEqual(['tm', 'start', '12']);
      expect(buildRunnerCommand('run-task', '12.3')).toEqual(['tm', 'start', '12.3']);
   });

   it('builds tm start for run-next with a resolved task ID', () => {
      expect(buildRunnerCommand('run-next', '4')).toEqual(['tm', 'start', '4']);
   });

   it('builds loop commands without any client input', () => {
      expect(buildRunnerCommand('loop')).toEqual(['tm', 'loop', '--verbose']);
      expect(buildRunnerCommand('loop-sandbox')).toEqual(['tm', 'loop', '--sandbox', '--verbose']);
   });

   it('throws on invalid task IDs instead of passing them through', () => {
      expect(() => buildRunnerCommand('run-task', '12; rm -rf /')).toThrow(RunnerError);
      expect(() => buildRunnerCommand('run-task')).toThrow(RunnerError);
      expect(() => buildRunnerCommand('run-task', null)).toThrow(RunnerError);
   });

   it('respects TASKMASTER_RUNNER_BIN', () => {
      process.env.TASKMASTER_RUNNER_BIN = '/usr/local/bin/tm';
      try {
         expect(buildRunnerCommand('loop')).toEqual(['/usr/local/bin/tm', 'loop', '--verbose']);
      } finally {
         delete process.env.TASKMASTER_RUNNER_BIN;
      }
   });
});

describe('resolveRunFilePath', () => {
   const runsDir = path.join(tmpdir(), 'runner-test', '.taskmaster', 'runs');

   it('resolves valid run IDs inside the runs directory', () => {
      const resolved = resolveRunFilePath(runsDir, '2026-07-05T10-30-00-abc123', '.log');
      expect(resolved).toBe(path.join(runsDir, '2026-07-05T10-30-00-abc123.log'));
   });

   it('rejects run IDs that would escape the runs directory', () => {
      expect(() => resolveRunFilePath(runsDir, '../../secrets', '.log')).toThrow(RunnerError);
      expect(() => resolveRunFilePath(runsDir, '..', '.json')).toThrow(RunnerError);
   });
});

describe('project root resolution', () => {
   let projectRoot: string;
   const savedEnv = { ...process.env };

   beforeEach(() => {
      projectRoot = mkdtempSync(path.join(tmpdir(), 'runner-root-'));
      mkdirSync(path.join(projectRoot, '.taskmaster', 'tasks'), { recursive: true });
      writeFileSync(
         path.join(projectRoot, '.taskmaster', 'tasks', 'tasks.json'),
         JSON.stringify({ master: { tasks: [] } })
      );
      delete process.env.TASKMASTER_DIR;
      process.env.USER_CWD = projectRoot;
   });

   afterEach(() => {
      rmSync(projectRoot, { recursive: true, force: true });
      process.env.TASKMASTER_DIR = savedEnv.TASKMASTER_DIR;
      process.env.USER_CWD = savedEnv.USER_CWD;
      if (savedEnv.TASKMASTER_DIR === undefined) delete process.env.TASKMASTER_DIR;
      if (savedEnv.USER_CWD === undefined) delete process.env.USER_CWD;
   });

   it('derives the configured root from the environment', () => {
      expect(getConfiguredProjectRoot()).toBe(path.resolve(projectRoot));
   });

   it('accepts a missing projectRoot (defaults to configured root)', async () => {
      await expect(resolveProjectRoot()).resolves.toBe(path.resolve(projectRoot));
   });

   it('accepts a projectRoot that matches the configured root', async () => {
      await expect(resolveProjectRoot(projectRoot)).resolves.toBe(path.resolve(projectRoot));
   });

   it('rejects any non-allowlisted projectRoot', async () => {
      await expect(resolveProjectRoot('/some/other/path')).rejects.toThrow(RunnerError);
      await expect(resolveProjectRoot(path.join(projectRoot, '..'))).rejects.toThrow(RunnerError);
   });

   it('rejects a root without .taskmaster/tasks/tasks.json', async () => {
      rmSync(path.join(projectRoot, '.taskmaster'), { recursive: true, force: true });
      await expect(resolveProjectRoot()).rejects.toThrow(RunnerError);
   });
});
