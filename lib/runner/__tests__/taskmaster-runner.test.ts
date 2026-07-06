import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { getActiveRun, getRunnerStatus, startRun, stopRun } from '../taskmaster-runner';
import { findNextTaskId } from '../next-task';
import { RunnerError } from '../runner-validation';

const IS_POSIX = process.platform !== 'win32';

function makeProject(tasks: object): string {
   const root = mkdtempSync(path.join(tmpdir(), 'runner-svc-'));
   mkdirSync(path.join(root, '.taskmaster', 'tasks'), { recursive: true });
   writeFileSync(path.join(root, '.taskmaster', 'tasks', 'tasks.json'), JSON.stringify(tasks));
   return root;
}

/** Fake `tm` binary that just sleeps, so runs stay active until stopped. */
function makeFakeTm(root: string, script = 'sleep 30'): string {
   const bin = path.join(root, 'fake-tm.sh');
   writeFileSync(bin, `#!/bin/sh\necho "fake tm: $@"\n${script}\n`, { mode: 0o755 });
   return bin;
}

async function waitFor(condition: () => boolean, timeoutMs = 8000): Promise<void> {
   const start = Date.now();
   while (!condition()) {
      if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
      await new Promise((resolve) => setTimeout(resolve, 50));
   }
}

describe.runIf(IS_POSIX)('taskmaster-runner service', () => {
   let root: string;

   beforeEach(() => {
      root = makeProject({ master: { tasks: [] } });
      process.env.TASKMASTER_RUNNER_BIN = makeFakeTm(root);
      // Keep the app database inside the test sandbox, not the repo.
      process.env.TASK_STUDIO_DB_PATH = path.join(root, 'test-db.sqlite');
   });

   afterEach(async () => {
      // Make sure nothing stays running between tests.
      const active = getActiveRun(root);
      if (active) {
         await stopRun(root, active.runId).catch(() => {});
         await waitFor(() => getActiveRun(root) === null);
      }
      delete process.env.TASKMASTER_RUNNER_BIN;
      delete process.env.TASK_STUDIO_DB_PATH;
      rmSync(root, { recursive: true, force: true });
   });

   it('creates run metadata, log file and lock file on start', async () => {
      const run = await startRun({ projectRoot: root, mode: 'run-task', taskId: '12' });

      expect(run.status).toBe('running');
      expect(run.taskId).toBe('12');
      expect(run.command.slice(1)).toEqual(['start', '12']);
      expect(run.pid).toBeGreaterThan(0);
      expect(run.logFile).toBe(`.taskmaster/runs/${run.runId}.log`);

      const metaPath = path.join(root, '.taskmaster', 'runs', `${run.runId}.json`);
      expect(existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      expect(meta.runId).toBe(run.runId);
      expect(meta.mode).toBe('run-task');
      expect(meta.status).toBe('running');
      expect(meta.finishedAt).toBeNull();
      expect(meta.exitCode).toBeNull();

      expect(existsSync(path.join(root, '.taskmaster', 'runner.lock'))).toBe(true);
   });

   it('blocks a second run while one is active', async () => {
      await startRun({ projectRoot: root, mode: 'run-task', taskId: '1' });

      await expect(startRun({ projectRoot: root, mode: 'run-task', taskId: '2' })).rejects.toThrow(
         RunnerError
      );
      await expect(
         startRun({ projectRoot: root, mode: 'run-task', taskId: '2' })
      ).rejects.toMatchObject({ code: 'RUNNER_BUSY' });
   });

   it('marks a stopped run as cancelled and removes the lock', async () => {
      const run = await startRun({ projectRoot: root, mode: 'loop' });

      await stopRun(root, run.runId);
      await waitFor(() => getActiveRun(root) === null);

      const status = await getRunnerStatus(root);
      const finished = status.recentRuns.find((r) => r.runId === run.runId);
      expect(finished?.status).toBe('cancelled');
      expect(existsSync(path.join(root, '.taskmaster', 'runner.lock'))).toBe(false);
   });

   it('marks a run completed when the process exits 0', async () => {
      process.env.TASKMASTER_RUNNER_BIN = makeFakeTm(root, 'exit 0');
      const run = await startRun({ projectRoot: root, mode: 'run-task', taskId: '3' });

      await waitFor(() => getActiveRun(root) === null);
      const status = await getRunnerStatus(root);
      const finished = status.recentRuns.find((r) => r.runId === run.runId);
      expect(finished?.status).toBe('completed');
      expect(finished?.exitCode).toBe(0);
   });

   it('marks a run failed when the process exits non-zero', async () => {
      process.env.TASKMASTER_RUNNER_BIN = makeFakeTm(root, 'exit 3');
      const run = await startRun({ projectRoot: root, mode: 'run-task', taskId: '3' });

      await waitFor(() => getActiveRun(root) === null);
      const status = await getRunnerStatus(root);
      const finished = status.recentRuns.find((r) => r.runId === run.runId);
      expect(finished?.status).toBe('failed');
      expect(finished?.exitCode).toBe(3);
   });

   it('fails with TM_NOT_FOUND when the binary is missing', async () => {
      process.env.TASKMASTER_RUNNER_BIN = path.join(root, 'does-not-exist');
      await expect(
         startRun({ projectRoot: root, mode: 'run-task', taskId: '1' })
      ).rejects.toMatchObject({ code: 'TM_NOT_FOUND' });
      // The reservation must be released so a later run can start.
      expect(getActiveRun(root)).toBeNull();
   });
});

describe('findNextTaskId', () => {
   afterEach(() => {
      // Each test creates its own root and removes it inline.
   });

   it('picks the lowest-ID pending task whose dependencies are done', async () => {
      const root = makeProject({
         master: {
            tasks: [
               { id: 1, status: 'done' },
               { id: 2, status: 'pending', dependencies: [1] },
               { id: 3, status: 'pending', dependencies: [2] },
            ],
         },
      });
      try {
         await expect(findNextTaskId(root)).resolves.toBe('2');
      } finally {
         rmSync(root, { recursive: true, force: true });
      }
   });

   it('throws NO_NEXT_TASK when nothing is eligible', async () => {
      const root = makeProject({
         master: {
            tasks: [
               { id: 1, status: 'done' },
               { id: 2, status: 'pending', dependencies: [3] },
               { id: 3, status: 'in-progress' },
            ],
         },
      });
      try {
         await expect(findNextTaskId(root)).rejects.toMatchObject({ code: 'NO_NEXT_TASK' });
      } finally {
         rmSync(root, { recursive: true, force: true });
      }
   });

   it('respects the current tag from state.json', async () => {
      const root = makeProject({
         'master': { tasks: [{ id: 1, status: 'pending' }] },
         'feature-x': { tasks: [{ id: 7, status: 'pending' }] },
      });
      writeFileSync(
         path.join(root, '.taskmaster', 'state.json'),
         JSON.stringify({ currentTag: 'feature-x' })
      );
      try {
         await expect(findNextTaskId(root)).resolves.toBe('7');
      } finally {
         rmSync(root, { recursive: true, force: true });
      }
   });
});
