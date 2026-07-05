import path from 'node:path';
import { RunnerMode } from '@/types/runner';
import { FORBIDDEN_ENV_KEYS, TaskStudioSettings } from '@/types/settings';
import { loadSettings } from '@/lib/settings/settings-service';
import { RunnerError, getTmBin } from './runner-validation';

/** Everything the runner needs from settings, resolved once per operation. */
export interface RunnerRuntimeConfig {
   tmBin: string;
   extraEnv: Record<string, string>;
   stopGraceTimeoutMs: number;
   historyLimit: number;
   logRetentionDays: number;
   maxLogResponseBytes: number;
   preferSandbox: boolean;
   auditEnabled: boolean;
   dependencyBehavior: 'block' | 'warn' | 'ignore';
   confirmBeforeRun: boolean;
   confirmBeforeLoop: boolean;
   settings: TaskStudioSettings;
}

function findProjectConfig(settings: TaskStudioSettings, projectRoot: string) {
   return settings.projects.items.find((p) => path.resolve(p.root) === path.resolve(projectRoot));
}

/**
 * Resolves runner configuration for a project root. Precedence for the
 * Taskmaster binary: TASKMASTER_RUNNER_BIN env > per-project override >
 * Taskmaster settings > 'tm'.
 */
export async function getRunnerRuntimeConfig(projectRoot: string): Promise<RunnerRuntimeConfig> {
   const settings = await loadSettings();
   const project = findProjectConfig(settings, projectRoot);

   const tmBin =
      process.env.TASKMASTER_RUNNER_BIN?.trim() ||
      project?.tmPathOverride ||
      settings.taskmaster.tmPath ||
      getTmBin();

   // Env policy: 'none' passes no custom vars; otherwise merge project +
   // Claude env (project wins). Keys were validated on save, but forbidden
   // keys are filtered again defensively.
   let extraEnv: Record<string, string> = {};
   if (settings.security.envPolicy !== 'none') {
      extraEnv = { ...settings.claude.env, ...(project?.env ?? {}) };
      for (const key of FORBIDDEN_ENV_KEYS) delete extraEnv[key];
   }

   return {
      tmBin,
      extraEnv,
      stopGraceTimeoutMs: settings.runner.stopGraceTimeoutMs,
      historyLimit: settings.runner.historyLimit,
      logRetentionDays: settings.runner.logRetentionDays,
      maxLogResponseBytes: settings.preferences.maxLogSizeKb * 1024,
      preferSandbox: project?.sandboxPreferred ?? settings.taskmaster.preferSandbox,
      auditEnabled: settings.security.auditLog,
      dependencyBehavior: settings.workflow.dependencyBehavior,
      confirmBeforeRun: settings.general.confirmBeforeRun,
      confirmBeforeLoop: settings.taskmaster.confirmBeforeLoop,
      settings,
   };
}

/**
 * Guards a run request against runner-level policies: runner enabled,
 * mode allowlisted, project root allowlisted (when an allowlist is set).
 */
export function assertRunAllowed(
   config: RunnerRuntimeConfig,
   mode: RunnerMode,
   projectRoot: string
): void {
   const { settings } = config;

   if (!settings.runner.enabled) {
      throw new RunnerError(
         'RUNNER_DISABLED',
         'The local runner is disabled in Settings → Runner.',
         403
      );
   }

   if (!settings.security.allowedRunnerModes.includes(mode)) {
      throw new RunnerError(
         'MODE_NOT_ALLOWED',
         `Runner mode '${mode}' is not allowed (Settings → Security & Access).`,
         403
      );
   }

   const project = findProjectConfig(settings, projectRoot);
   if (project && !project.runnerEnabled) {
      throw new RunnerError('RUNNER_DISABLED', 'The runner is disabled for this project.', 403);
   }

   const allowlist = settings.general.projectRootAllowlist;
   if (allowlist.length > 0) {
      const resolved = path.resolve(projectRoot);
      const allowed = allowlist.some((entry) => path.resolve(entry) === resolved);
      if (!allowed) {
         throw new RunnerError(
            'INVALID_PROJECT_ROOT',
            'This project root is not in the allowlist (Settings → General).',
            403
         );
      }
   }
}
