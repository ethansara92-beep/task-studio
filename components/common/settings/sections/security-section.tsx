'use client';

import Link from 'next/link';
import { Checkbox } from '@/components/ui/checkbox';
import { RUNNER_MODES } from '@/types/runner';
import { useSettingsSection } from '@/hooks/use-settings';
import {
   SettingRow,
   SettingsCard,
   SettingsPage,
   SettingsSaveBar,
   SelectField,
   SwitchRow,
} from '../settings-ui';

const MODE_LABELS: Record<(typeof RUNNER_MODES)[number], string> = {
   'run-task': 'Run specific task',
   'run-next': 'Run next task',
   'loop': 'Loop',
   'loop-sandbox': 'Sandbox loop',
};

export function SecuritySection() {
   const form = useSettingsSection('security');
   const { draft, update } = form;

   return (
      <SettingsPage
         title="Security & Access"
         description="Local safety policies for the runner and sensitive values. Task Studio is a single-user local tool - these settings guard against accidents, not attackers with machine access."
      >
         <SettingsCard title="Runner policies">
            <SettingRow label="Allowed runner modes" vertical>
               <div className="grid grid-cols-2 gap-2">
                  {RUNNER_MODES.map((mode) => (
                     <label key={mode} className="flex items-center gap-2 text-sm">
                        <Checkbox
                           checked={draft.allowedRunnerModes.includes(mode)}
                           onCheckedChange={(checked) =>
                              update({
                                 allowedRunnerModes: checked
                                    ? [...draft.allowedRunnerModes, mode]
                                    : draft.allowedRunnerModes.filter((m) => m !== mode),
                              })
                           }
                        />
                        {MODE_LABELS[mode]}
                     </label>
                  ))}
               </div>
            </SettingRow>
            {draft.allowedRunnerModes.length === 0 && (
               <p className="px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
                  ⚠ No modes allowed - every run request will be rejected.
               </p>
            )}
            <SettingRow
               label="Project root allowlist"
               description="Managed in Settings → General. When set, the runner refuses any root not listed."
            >
               <Link href="/settings/general" className="text-xs text-primary hover:underline">
                  Open General settings
               </Link>
            </SettingRow>
            <SettingRow
               label="Executable paths"
               description="Taskmaster/Claude paths are validated with a fixed --version spawn and stored as paths, never as commands. Managed in Settings → Taskmaster & Claude Code."
            >
               <Link
                  href="/settings/taskmaster-claude"
                  className="text-xs text-primary hover:underline"
               >
                  Open CLI settings
               </Link>
            </SettingRow>
         </SettingsCard>

         <SettingsCard title="Environment variables">
            <SettingRow
               label="Environment variable policy"
               description="'None' ignores all custom variables. 'Safe list' passes validated UPPER_SNAKE_CASE keys (PATH-like keys always blocked). 'Custom' behaves the same but acknowledges you may set anything."
            >
               <SelectField
                  value={draft.envPolicy}
                  onChange={(envPolicy) => update({ envPolicy })}
                  options={[
                     { value: 'none', label: 'Allow none' },
                     { value: 'safe-list', label: 'Safe list only' },
                     { value: 'custom', label: 'Custom (with warning)' },
                  ]}
               />
            </SettingRow>
            {draft.envPolicy === 'custom' && (
               <p className="px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
                  ⚠ Custom environment variables are stored in plain text in the local settings
                  file. Do not put API keys or tokens there.
               </p>
            )}
         </SettingsCard>

         <SettingsCard title="Sensitive values">
            <SwitchRow
               label="Mask sensitive values"
               description="Webhook URLs and signing secrets are masked in the UI after saving."
               checked={draft.maskSensitiveValues}
               onChange={(maskSensitiveValues) => update({ maskSensitiveValues })}
               disabled
            />
            <p className="px-4 py-2 text-xs text-muted-foreground">
               Masking is always on: secrets never leave the server unmasked, regardless of this
               toggle. To clear a secret, empty its field in the section that owns it and save.
            </p>
            <SettingRow
               label="Claude permission mode"
               description="'Bypass permissions' is disabled by default and shows a strong warning when selected (Settings → Taskmaster & Claude Code)."
            >
               <Link
                  href="/settings/taskmaster-claude"
                  className="text-xs text-primary hover:underline"
               >
                  Open Claude settings
               </Link>
            </SettingRow>
         </SettingsCard>

         <SettingsCard
            title="Audit log"
            description="A local JSONL log of settings changes, runner starts/stops, and validations. Never contains setting values or secrets."
         >
            <SwitchRow
               label="Enable audit log"
               description="Written to .taskmaster/task-studio-audit.log."
               checked={draft.auditLog}
               onChange={(auditLog) => update({ auditLog })}
            />
         </SettingsCard>

         <SettingsSaveBar
            isDirty={form.isDirty}
            isSaving={form.isSaving}
            onSave={form.save}
            onDiscard={form.discard}
         />
      </SettingsPage>
   );
}
