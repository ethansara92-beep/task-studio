'use client';

import * as React from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { validateBinary } from '@/lib/api/settings';
import { useSaveSettings, useSettingsSection } from '@/hooks/use-settings';
import {
   AdvancedGroup,
   EnvVarsField,
   NumberField,
   SettingRow,
   SettingsCard,
   SettingsPage,
   SettingsSaveBar,
   SelectField,
   StringListField,
   SwitchRow,
} from '../settings-ui';

type CheckState =
   | { state: 'idle' }
   | { state: 'checking' }
   | { state: 'ok'; version: string }
   | { state: 'error'; error: string };

function BinaryPathField({
   tool,
   value,
   onChange,
   onCheck,
   check,
}: {
   tool: 'taskmaster' | 'claude';
   value: string;
   onChange: (value: string) => void;
   onCheck: () => void;
   check: CheckState;
}) {
   return (
      <div className="w-full space-y-1.5">
         <div className="flex items-center gap-2">
            <Input
               value={value}
               onChange={(e) => onChange(e.target.value)}
               placeholder={tool === 'taskmaster' ? 'tm' : 'claude'}
               className="h-8 text-sm font-mono"
            />
            <Button
               variant="outline"
               size="sm"
               onClick={onCheck}
               disabled={check.state === 'checking'}
            >
               {check.state === 'checking' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
               Validate
            </Button>
         </div>
         {check.state === 'ok' && (
            <p className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
               <CheckCircle2 className="h-3 w-3" /> {check.version}
            </p>
         )}
         {check.state === 'error' && (
            <p className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
               <XCircle className="h-3 w-3" /> {check.error}
            </p>
         )}
      </div>
   );
}

export function TaskmasterClaudeSection() {
   const tmForm = useSettingsSection('taskmaster');
   const claudeForm = useSettingsSection('claude');
   const [tmCheck, setTmCheck] = React.useState<CheckState>({ state: 'idle' });
   const [claudeCheck, setClaudeCheck] = React.useState<CheckState>({ state: 'idle' });

   const runCheck = async (
      tool: 'taskmaster' | 'claude',
      path: string,
      setState: (s: CheckState) => void
   ) => {
      setState({ state: 'checking' });
      const result = await validateBinary(tool, path);
      if (result.success && result.data?.ok) {
         setState({ state: 'ok', version: result.data.version ?? 'OK' });
      } else {
         setState({
            state: 'error',
            error: result.data?.error || result.error || 'Validation failed',
         });
      }
   };

   const saveMutation = useSaveSettings();
   const isDirty = tmForm.isDirty || claudeForm.isDirty;
   const isSaving = saveMutation.isPending;
   const saveBoth = () => {
      // Both halves live in one settings document - save them in one write.
      if (!tmForm.settings) return;
      saveMutation.mutate(
         { ...tmForm.settings, taskmaster: tmForm.draft, claude: claudeForm.draft },
         {
            onSuccess: () => {
               tmForm.markClean();
               claudeForm.markClean();
            },
         }
      );
   };

   return (
      <SettingsPage
         title="Taskmaster & Claude Code"
         description="Executable paths and behavior for the CLIs the runner drives. Paths are validated by spawning them with a single fixed --version argument (never a shell)."
      >
         <SettingsCard title="Taskmaster CLI">
            <SettingRow
               label="Executable path"
               description="A command name on PATH or an absolute path. Only the executable path is stored - never a command string."
               vertical
            >
               <BinaryPathField
                  tool="taskmaster"
                  value={tmForm.draft.tmPath}
                  onChange={(tmPath) => tmForm.update({ tmPath })}
                  onCheck={() => runCheck('taskmaster', tmForm.draft.tmPath, setTmCheck)}
                  check={tmCheck}
               />
            </SettingRow>
            <SettingRow label="Default runner mode">
               <SelectField
                  value={tmForm.draft.defaultRunnerMode}
                  onChange={(defaultRunnerMode) => tmForm.update({ defaultRunnerMode })}
                  options={[
                     { value: 'run-task', label: 'Run specific task' },
                     { value: 'run-next', label: 'Run next task' },
                     { value: 'loop', label: 'Loop' },
                     { value: 'loop-sandbox', label: 'Sandbox loop' },
                  ]}
               />
            </SettingRow>
            <SwitchRow
               label="Prefer sandbox mode"
               description="The loop button defaults to the Docker sandbox variant."
               checked={tmForm.draft.preferSandbox}
               onChange={(preferSandbox) => tmForm.update({ preferSandbox })}
            />
            <SwitchRow
               label="Confirm before starting a loop"
               description="Loops can run many tasks unattended - ask first."
               checked={tmForm.draft.confirmBeforeLoop}
               onChange={(confirmBeforeLoop) => tmForm.update({ confirmBeforeLoop })}
            />
            <AdvancedGroup>
               <SwitchRow
                  label="Auto-expand task before run"
                  description="Stored for future use - Task Studio does not call tm expand automatically yet."
                  checked={tmForm.draft.autoExpandBeforeRun}
                  onChange={(autoExpandBeforeRun) => tmForm.update({ autoExpandBeforeRun })}
               />
               <SwitchRow
                  label="Auto-set status to in-progress"
                  description="Stored for future use - Taskmaster manages status during tm start itself."
                  checked={tmForm.draft.autoSetInProgress}
                  onChange={(autoSetInProgress) => tmForm.update({ autoSetInProgress })}
               />
               <SwitchRow
                  label="Auto-mark done after successful run"
                  description="Off by default: a zero exit code does not guarantee the task is truly done."
                  checked={tmForm.draft.autoMarkDone}
                  onChange={(autoMarkDone) => tmForm.update({ autoMarkDone })}
               />
               <SwitchRow
                  label="Stop loop on failed tests"
                  description="Stored for future use - requires Taskmaster loop support."
                  checked={tmForm.draft.stopOnFailedTests}
                  onChange={(stopOnFailedTests) => tmForm.update({ stopOnFailedTests })}
               />
            </AdvancedGroup>
         </SettingsCard>

         <SettingsCard
            title="Claude Code"
            description="Today Claude Code is launched by Taskmaster, so these options apply when Task Studio invokes Claude directly (planned) - except the path validation, which works now."
         >
            <SettingRow label="Executable path" vertical>
               <BinaryPathField
                  tool="claude"
                  value={claudeForm.draft.claudePath}
                  onChange={(claudePath) => claudeForm.update({ claudePath })}
                  onCheck={() => runCheck('claude', claudeForm.draft.claudePath, setClaudeCheck)}
                  check={claudeCheck}
               />
            </SettingRow>
            <SettingRow label="Max turns" description="Empty means no limit.">
               <NumberField
                  value={claudeForm.draft.maxTurns}
                  onChange={(maxTurns) => claudeForm.update({ maxTurns })}
                  min={1}
                  max={1000}
               />
            </SettingRow>
            <SettingRow label="Max budget" description="Empty means no limit.">
               <NumberField
                  value={claudeForm.draft.maxBudgetUsd}
                  onChange={(maxBudgetUsd) => claudeForm.update({ maxBudgetUsd })}
                  min={0}
                  max={10000}
                  unit="USD"
               />
            </SettingRow>
            <SettingRow label="Permission mode">
               <SelectField
                  value={claudeForm.draft.permissionMode}
                  onChange={(permissionMode) => claudeForm.update({ permissionMode })}
                  options={[
                     { value: 'default', label: 'Default' },
                     { value: 'plan', label: 'Plan' },
                     { value: 'acceptEdits', label: 'Accept edits' },
                     { value: 'bypassPermissions', label: 'Bypass permissions' },
                  ]}
               />
            </SettingRow>
            {claudeForm.draft.permissionMode === 'bypassPermissions' && (
               <p className="px-4 py-2 text-xs text-red-600 dark:text-red-400">
                  ⚠ Bypassing permissions lets Claude run any tool without asking. Only use this in
                  disposable environments.
               </p>
            )}
            <AdvancedGroup>
               <SettingRow
                  label="Allowed tools"
                  description="Structured tool names (e.g. Read, Edit, Bash). Empty means Claude's defaults."
                  vertical
               >
                  <StringListField
                     values={claudeForm.draft.allowedTools}
                     onChange={(allowedTools) => claudeForm.update({ allowedTools })}
                     placeholder="ToolName"
                  />
               </SettingRow>
               <SettingRow label="Disallowed tools" vertical>
                  <StringListField
                     values={claudeForm.draft.disallowedTools}
                     onChange={(disallowedTools) => claudeForm.update({ disallowedTools })}
                     placeholder="ToolName"
                  />
               </SettingRow>
               <SettingRow
                  label="Extra environment variables"
                  description="Merged into the runner's environment (unless the Security env policy is 'none')."
                  vertical
               >
                  <EnvVarsField
                     values={claudeForm.draft.env}
                     onChange={(env) => claudeForm.update({ env })}
                  />
               </SettingRow>
            </AdvancedGroup>
         </SettingsCard>

         <SettingsSaveBar
            isDirty={isDirty}
            isSaving={isSaving}
            onSave={saveBoth}
            onDiscard={() => {
               tmForm.discard();
               claudeForm.discard();
            }}
         />
      </SettingsPage>
   );
}
