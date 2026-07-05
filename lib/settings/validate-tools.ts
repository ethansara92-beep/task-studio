import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { executablePathSchema } from '@/types/settings';

const VALIDATE_TIMEOUT_MS = 10000;

export interface BinaryCheckResult {
   ok: boolean;
   version?: string;
   error?: string;
}

/**
 * Validates an executable by running it with a single fixed argument
 * (`--version`) via spawn with shell: false. The path is user-configured
 * but is only ever used as argv[0] - never interpreted by a shell.
 */
export async function validateBinary(executablePath: string): Promise<BinaryCheckResult> {
   const parsed = executablePathSchema.safeParse(executablePath);
   if (!parsed.success) {
      return { ok: false, error: parsed.error.errors[0].message };
   }

   return new Promise((resolve) => {
      let child: ReturnType<typeof spawn>;
      try {
         child = spawn(parsed.data, ['--version'], {
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
         });
      } catch (error) {
         resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
         return;
      }

      let stdout = '';
      let stderr = '';
      let settled = false;

      const finish = (result: BinaryCheckResult) => {
         if (settled) return;
         settled = true;
         clearTimeout(timer);
         resolve(result);
      };

      const timer = setTimeout(() => {
         child.kill('SIGKILL');
         finish({ ok: false, error: 'Timed out waiting for --version (10s)' });
      }, VALIDATE_TIMEOUT_MS);

      child.stdout?.on('data', (chunk) => (stdout += chunk));
      child.stderr?.on('data', (chunk) => (stderr += chunk));

      child.on('error', (error: NodeJS.ErrnoException) => {
         if (error.code === 'ENOENT') {
            finish({ ok: false, error: `Executable not found: ${executablePath}` });
         } else if (error.code === 'EACCES') {
            finish({ ok: false, error: `Permission denied: ${executablePath}` });
         } else {
            finish({ ok: false, error: error.message });
         }
      });

      child.on('close', (code) => {
         const output = (stdout || stderr).trim().split('\n')[0]?.slice(0, 200) ?? '';
         if (code === 0) {
            finish({ ok: true, version: output || 'version unknown' });
         } else {
            finish({
               ok: false,
               error: `--version exited with code ${code}${output ? `: ${output}` : ''}`,
            });
         }
      });
   });
}

export interface ProjectRootCheckResult {
   ok: boolean;
   normalizedRoot?: string;
   error?: string;
}

/**
 * Validates a candidate project root: absolute, exists, and contains
 * `.taskmaster/tasks/tasks.json`. Used for the allowlist editor - the
 * runner itself still only executes inside the server's configured root.
 */
export async function validateProjectRootPath(candidate: string): Promise<ProjectRootCheckResult> {
   if (!candidate || candidate.length > 1000) {
      return { ok: false, error: 'Path is required' };
   }
   if (!path.isAbsolute(candidate)) {
      return { ok: false, error: 'Path must be absolute (e.g. /home/me/my-project)' };
   }

   const normalized = path.resolve(candidate);

   let stat;
   try {
      stat = await fs.stat(normalized);
   } catch {
      return { ok: false, error: 'Path does not exist' };
   }
   if (!stat.isDirectory()) {
      return { ok: false, error: 'Path is not a directory' };
   }

   try {
      await fs.access(path.join(normalized, '.taskmaster', 'tasks', 'tasks.json'));
   } catch {
      return {
         ok: false,
         normalizedRoot: normalized,
         error: 'No .taskmaster/tasks/tasks.json found - not an initialized Taskmaster project',
      };
   }

   return { ok: true, normalizedRoot: normalized };
}
