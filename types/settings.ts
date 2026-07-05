import { z } from 'zod';
import { RUNNER_MODES } from './runner';

/**
 * Task Studio settings schema. Persisted at
 * `.taskmaster/task-studio-settings.json` (machine-local, git-ignored).
 *
 * Secrets policy: fields marked (secret) are masked in every API response.
 * The client sends back the mask sentinel to mean "keep the stored value".
 */

export const SETTINGS_VERSION = 1;

/** Sentinel returned for stored secrets; sending it back keeps the stored value. */
export const SECRET_MASK = '••••••••';

// --- Field-level schemas ---------------------------------------------------

/** Environment variable keys: conventional uppercase, no injection surface. */
export const envKeySchema = z
   .string()
   .regex(/^[A-Z_][A-Z0-9_]*$/, 'Keys must be UPPER_SNAKE_CASE (letters, digits, underscore)')
   .max(64);

/** PATH-like overrides are rejected: they could redirect which binaries run. */
export const FORBIDDEN_ENV_KEYS = ['PATH', 'NODE_OPTIONS', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES'];

export const envVarsSchema = z
   .record(z.string().max(4096))
   .refine((vars) => Object.keys(vars).every((k) => envKeySchema.safeParse(k).success), {
      message: 'Environment variable keys must be UPPER_SNAKE_CASE',
   })
   .refine((vars) => !Object.keys(vars).some((k) => FORBIDDEN_ENV_KEYS.includes(k)), {
      message: `These keys cannot be overridden: ${FORBIDDEN_ENV_KEYS.join(', ')}`,
   });

/**
 * Executable path: a bare command name or an absolute path. Never a command
 * string - it is passed as argv[0] to spawn with shell: false.
 */
export const executablePathSchema = z
   .string()
   .min(1)
   .max(500)
   .refine((v) => !/[\s;&|<>$`"'\\]/.test(v) || /^([A-Za-z]:)?[/\\]/.test(v), {
      message: 'Must be a command name or an absolute path, not a shell command',
   });

/** Webhook URLs: https anywhere, plain http only for localhost. */
export const webhookUrlSchema = z
   .string()
   .max(2000)
   .refine(
      (value) => {
         if (value === '' || value === SECRET_MASK) return true;
         try {
            const url = new URL(value);
            if (url.protocol === 'https:') return true;
            if (url.protocol === 'http:') {
               return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
            }
            return false;
         } catch {
            return false;
         }
      },
      { message: 'Must be an https:// URL (http:// is allowed for localhost only)' }
   );

export const runnerModeSchema = z.enum(RUNNER_MODES);

export const WEBHOOK_EVENTS = [
   'task.created',
   'task.updated',
   'task.status_changed',
   'runner.started',
   'runner.completed',
   'runner.failed',
   'runner.cancelled',
   'settings.updated',
] as const;

// --- Section schemas -------------------------------------------------------

const generalSchema = z.object({
   displayName: z.string().max(100).default('Task Studio'),
   defaultProjectRoot: z.string().max(1000).nullable().default(null),
   projectRootAllowlist: z.array(z.string().min(1).max(1000)).max(50).default([]),
   startupBehavior: z
      .enum(['last-project', 'default-project', 'project-picker'])
      .default('last-project'),
   confirmBeforeRun: z.boolean().default(false),
   confirmBeforeStop: z.boolean().default(true),
   confirmBeforeReset: z.boolean().default(true),
});

const preferencesSchema = z.object({
   theme: z.enum(['system', 'light', 'dark']).default('system'),
   density: z.enum(['comfortable', 'compact']).default('comfortable'),
   sidebarBehavior: z.enum(['expanded', 'collapsed', 'remember']).default('remember'),
   dateTimeFormat: z.enum(['system', 'iso', 'relative']).default('system'),
   defaultTaskView: z.enum(['list', 'board']).default('list'),
   autoRefreshTasks: z.boolean().default(true),
   taskRefreshIntervalMs: z.number().int().min(500).max(10000).default(1500),
   logAutoRefresh: z.boolean().default(true),
   logRefreshIntervalMs: z.number().int().min(500).max(10000).default(1500),
   maxLogSizeKb: z.number().int().min(16).max(2048).default(512),
});

const workspaceSchema = z.object({
   name: z.string().max(100).default('My Workspace'),
   initials: z.string().max(3).default(''),
   description: z.string().max(500).default(''),
   defaultTag: z.string().max(100).default('master'),
   runnerPolicy: z.enum(['allow', 'require-confirmation', 'sandbox-preferred']).default('allow'),
   createdAt: z.string().default(''),
   updatedAt: z.string().default(''),
});

const projectSchema = z.object({
   root: z.string().min(1).max(1000),
   runnerEnabled: z.boolean().default(true),
   defaultRunnerMode: runnerModeSchema.default('run-task'),
   sandboxPreferred: z.boolean().default(false),
   maxConcurrentRuns: z.number().int().min(1).max(4).default(1),
   tmPathOverride: executablePathSchema.or(z.literal('')).default(''),
   claudePathOverride: executablePathSchema.or(z.literal('')).default(''),
   env: envVarsSchema.default({}),
});
export type ProjectConfig = z.infer<typeof projectSchema>;

const projectsSchema = z.object({
   items: z.array(projectSchema).max(50).default([]),
   defaultRoot: z.string().max(1000).nullable().default(null),
});

const taskmasterSchema = z.object({
   tmPath: executablePathSchema.default('tm'),
   defaultRunnerMode: runnerModeSchema.default('run-task'),
   preferSandbox: z.boolean().default(false),
   autoExpandBeforeRun: z.boolean().default(false),
   autoSetInProgress: z.boolean().default(false),
   autoMarkDone: z.boolean().default(false),
   stopOnFailedTests: z.boolean().default(false),
   confirmBeforeLoop: z.boolean().default(true),
});

const claudeSchema = z.object({
   claudePath: executablePathSchema.default('claude'),
   maxTurns: z.number().int().min(1).max(1000).nullable().default(null),
   maxBudgetUsd: z.number().min(0).max(10000).nullable().default(null),
   permissionMode: z
      .enum(['default', 'plan', 'acceptEdits', 'bypassPermissions'])
      .default('default'),
   allowedTools: z.array(z.string().min(1).max(100)).max(100).default([]),
   disallowedTools: z.array(z.string().min(1).max(100)).max(100).default([]),
   env: envVarsSchema.default({}),
});

const runnerSchema = z.object({
   enabled: z.boolean().default(true),
   defaultMode: runnerModeSchema.default('run-task'),
   oneRunPerProject: z.boolean().default(true),
   historyLimit: z.number().int().min(5).max(500).default(50),
   logRetentionDays: z.number().int().min(1).max(365).default(14),
   staleLockTimeoutMinutes: z.number().int().min(1).max(1440).default(30),
   stopGraceTimeoutMs: z.number().int().min(1000).max(60000).default(5000),
   showLiveLogs: z.boolean().default(true),
});

const workflowSchema = z.object({
   defaultStatus: z.string().max(50).default('pending'),
   readyStatus: z.string().max(50).default('pending'),
   inProgressStatus: z.string().max(50).default('in-progress'),
   doneStatus: z.string().max(50).default('done'),
   blockedStatus: z.string().max(50).default('blocked'),
   autoRunTrigger: z.enum(['manual', 'on-ready-status', 'on-ai-run-label']).default('manual'),
   dependencyBehavior: z.enum(['block', 'warn', 'ignore']).default('block'),
   priorityMapping: z
      .object({
         urgent: z.string().max(50).default('urgent'),
         high: z.string().max(50).default('high'),
         medium: z.string().max(50).default('medium'),
         low: z.string().max(50).default('low'),
      })
      .default({}),
});

const labelSchema = z.object({
   name: z
      .string()
      .min(1)
      .max(50)
      .regex(/^[a-z0-9][a-z0-9-]*$/, 'Lowercase letters, digits and hyphens only'),
   color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color like #6366f1')
      .default('#6366f1'),
   description: z.string().max(200).default(''),
});
export type LabelConfig = z.infer<typeof labelSchema>;

const labelsSchema = z.object({
   items: z.array(labelSchema).max(100).default([]),
   aiRunLabel: z.string().max(50).default('ai-run'),
   needsReviewLabel: z.string().max(50).default('needs-review'),
});

const templateSchema = z.object({
   id: z.string().min(1).max(50),
   name: z.string().min(1).max(100),
   content: z.string().max(20000),
});
export type TemplateConfig = z.infer<typeof templateSchema>;

const templatesSchema = z.object({
   promptPrefix: z.string().max(5000).default(''),
   promptSuffix: z.string().max(5000).default(''),
   items: z.array(templateSchema).max(50).default([]),
});

const notificationsSchema = z.object({
   inApp: z.boolean().default(true),
   onRunStart: z.boolean().default(true),
   onRunComplete: z.boolean().default(true),
   onRunFail: z.boolean().default(true),
   onRunCancel: z.boolean().default(false),
   onTaskFileChange: z.boolean().default(false),
   desktop: z.boolean().default(false),
   slackWebhookUrl: webhookUrlSchema.default(''), // (secret)
   discordWebhookUrl: webhookUrlSchema.default(''), // (secret)
});

const integrationsSchema = z.object({
   github: z
      .object({
         enabled: z.boolean().default(false),
         repoUrl: z.string().max(500).default(''),
         defaultBranch: z.string().max(100).default('main'),
      })
      .default({}),
   gitlab: z
      .object({
         enabled: z.boolean().default(false),
         repoUrl: z.string().max(500).default(''),
         defaultBranch: z.string().max(100).default('main'),
      })
      .default({}),
   linear: z.object({ enabled: z.boolean().default(false) }).default({}),
   custom: z
      .object({
         name: z.string().max(100).default(''),
         description: z.string().max(500).default(''),
         enabled: z.boolean().default(false),
         webhookUrl: webhookUrlSchema.default(''), // (secret)
         events: z.array(z.enum(WEBHOOK_EVENTS)).default([]),
      })
      .default({}),
});

const webhookEndpointSchema = z.object({
   id: z.string().min(1).max(50),
   name: z.string().min(1).max(100),
   url: webhookUrlSchema,
   secret: z.string().max(500).default(''), // (secret) HMAC signing key
   enabled: z.boolean().default(true),
   events: z.array(z.enum(WEBHOOK_EVENTS)).default([]),
});
export type WebhookEndpoint = z.infer<typeof webhookEndpointSchema>;

const webhooksSchema = z.object({
   enabled: z.boolean().default(false),
   timeoutMs: z.number().int().min(1000).max(30000).default(5000),
   endpoints: z.array(webhookEndpointSchema).max(20).default([]),
});

const developerSchema = z.object({
   debugLogging: z.boolean().default(false),
   experimental: z
      .object({
         autoRunOnLabel: z.boolean().default(false),
         webhookDelivery: z.boolean().default(false),
         worktreePerTask: z.boolean().default(false),
         prCreation: z.boolean().default(false),
         multiAgent: z.boolean().default(false),
         sseLogStreaming: z.boolean().default(false),
      })
      .default({}),
});

const securitySchema = z.object({
   envPolicy: z.enum(['none', 'safe-list', 'custom']).default('safe-list'),
   allowedRunnerModes: z.array(runnerModeSchema).default([...RUNNER_MODES]),
   maskSensitiveValues: z.boolean().default(true),
   auditLog: z.boolean().default(true),
});

// --- Root schema -----------------------------------------------------------

export const settingsSchema = z.object({
   version: z.number().int().default(SETTINGS_VERSION),
   general: generalSchema.default({}),
   preferences: preferencesSchema.default({}),
   workspace: workspaceSchema.default({}),
   projects: projectsSchema.default({}),
   taskmaster: taskmasterSchema.default({}),
   claude: claudeSchema.default({}),
   runner: runnerSchema.default({}),
   workflow: workflowSchema.default({}),
   labels: labelsSchema.default({}),
   templates: templatesSchema.default({}),
   notifications: notificationsSchema.default({}),
   integrations: integrationsSchema.default({}),
   webhooks: webhooksSchema.default({}),
   developer: developerSchema.default({}),
   security: securitySchema.default({}),
});

export type TaskStudioSettings = z.infer<typeof settingsSchema>;
export type SettingsSectionKey = Exclude<keyof TaskStudioSettings, 'version'>;

export const DEFAULT_LABELS: LabelConfig[] = [
   { name: 'ai-run', color: '#6366f1', description: 'Task is eligible for the AI runner' },
   { name: 'bug', color: '#ef4444', description: 'Something is broken' },
   { name: 'feature', color: '#22c55e', description: 'New functionality' },
   { name: 'refactor', color: '#f59e0b', description: 'Code improvement without behavior change' },
   { name: 'test', color: '#06b6d4', description: 'Testing work' },
   { name: 'docs', color: '#8b5cf6', description: 'Documentation' },
   { name: 'blocked', color: '#64748b', description: 'Cannot proceed' },
   { name: 'needs-review', color: '#ec4899', description: 'Requires manual review' },
];

export const DEFAULT_TEMPLATES: TemplateConfig[] = [
   {
      id: 'bug-fix',
      name: 'Bug fix',
      content:
         'Fix the bug described in task {{taskId}}: {{taskTitle}}.\n\n{{taskDescription}}\n\nReproduce the issue first, fix the root cause, and add a regression test.',
   },
   {
      id: 'feature',
      name: 'Feature',
      content:
         'Implement task {{taskId}}: {{taskTitle}}.\n\n{{taskDescription}}\n\nFollow existing project conventions. Priority: {{priority}}.',
   },
   {
      id: 'refactor',
      name: 'Refactor',
      content:
         'Refactor as described in task {{taskId}}: {{taskTitle}}.\n\n{{taskDescription}}\n\nDo not change external behavior. Keep the diff focused.',
   },
   {
      id: 'test-writing',
      name: 'Test writing',
      content:
         'Write tests for task {{taskId}}: {{taskTitle}}.\n\n{{taskDescription}}\n\nCover edge cases and failure paths, not just the happy path.',
   },
   {
      id: 'documentation',
      name: 'Documentation',
      content:
         'Write documentation for task {{taskId}}: {{taskTitle}}.\n\n{{taskDescription}}\n\nKeep it concise and include examples.',
   },
   {
      id: 'code-review',
      name: 'Code review',
      content:
         'Review the changes related to task {{taskId}}: {{taskTitle}}.\n\nLook for correctness bugs, security issues, and unnecessary complexity.',
   },
];

/** Variables available in prompt templates (text substitution only). */
export const TEMPLATE_VARIABLES = [
   'taskId',
   'taskTitle',
   'taskDescription',
   'projectRoot',
   'dependencies',
   'priority',
   'status',
] as const;

/** Fully-populated defaults (schema defaults + seeded labels/templates). */
export function createDefaultSettings(): TaskStudioSettings {
   const defaults = settingsSchema.parse({});
   defaults.labels.items = [...DEFAULT_LABELS];
   defaults.templates.items = DEFAULT_TEMPLATES.map((t) => ({ ...t }));
   return defaults;
}
