'use client';

import { CheckCircle2, Copy, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useDiagnostics, useMaintenance, useSettingsSection } from '@/hooks/use-settings';
import {
   ConfirmActionButton,
   SettingRow,
   SettingsCard,
   SettingsPage,
   SettingsSaveBar,
   SwitchRow,
} from '../settings-ui';

function DiagRow({ label, value }: { label: string; value: string }) {
   return (
      <SettingRow label={label}>
         <span
            className="text-xs text-muted-foreground font-mono max-w-[340px] truncate"
            title={value}
         >
            {value}
         </span>
      </SettingRow>
   );
}

export function DeveloperSection() {
   const form = useSettingsSection('developer');
   const { draft, update, replace } = form;
   const { data: diag, isLoading } = useDiagnostics();
   const maintenance = useMaintenance();

   const copyDiagnostics = () => {
      if (!diag) return;
      navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
      toast.success('Diagnostics copied to clipboard');
   };

   const experimental = draft.experimental;
   const setExperimental = (patch: Partial<typeof experimental>) =>
      replace({ ...draft, experimental: { ...experimental, ...patch } });

   return (
      <SettingsPage
         title="Developer"
         description="Environment diagnostics, debug options, and experimental feature flags."
      >
         <SettingsCard
            title="Environment"
            actions={
               <Button variant="outline" size="sm" onClick={copyDiagnostics} disabled={!diag}>
                  <Copy className="h-3.5 w-3.5" />
                  Copy diagnostics
               </Button>
            }
         >
            {isLoading || !diag ? (
               <p className="px-4 py-3 text-xs text-muted-foreground">Loading diagnostics…</p>
            ) : (
               <>
                  <DiagRow label="App version" value={diag.appVersion} />
                  <DiagRow label="Node" value={diag.nodeVersion} />
                  <DiagRow label="Platform" value={diag.platform} />
                  <DiagRow label="Project root" value={diag.projectRoot} />
                  <DiagRow label="Settings file" value={diag.settingsFilePath} />
                  <DiagRow label="Tasks file" value={diag.tasksFilePath} />
                  <DiagRow label="Runner logs" value={diag.runsDirPath} />
                  <SettingRow label="Taskmaster CLI">
                     <span className="flex items-center gap-1.5 text-xs font-mono">
                        {diag.taskmaster.ok ? (
                           <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                           <XCircle className="h-3.5 w-3.5 text-red-500" />
                        )}
                        {diag.taskmaster.ok ? diag.taskmaster.version : diag.taskmaster.error}
                     </span>
                  </SettingRow>
                  <SettingRow label="Claude Code CLI">
                     <span className="flex items-center gap-1.5 text-xs font-mono">
                        {diag.claude.ok ? (
                           <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                           <XCircle className="h-3.5 w-3.5 text-red-500" />
                        )}
                        {diag.claude.ok ? diag.claude.version : diag.claude.error}
                     </span>
                  </SettingRow>
               </>
            )}
         </SettingsCard>

         <SettingsCard title="Debugging">
            <SwitchRow
               label="Debug logging"
               description="Verbose server-side logging for runner and settings operations."
               checked={draft.debugLogging}
               onChange={(debugLogging) => update({ debugLogging })}
            />
            <SettingRow
               label="Clear stale runner lock"
               description="Removes .taskmaster/runner.lock if its process is dead."
            >
               <ConfirmActionButton
                  label="Clear stale lock"
                  title="Clear stale lock?"
                  description="Only proceeds if the lock's process is no longer alive."
                  confirmLabel="Clear"
                  variant="outline"
                  onConfirm={() => maintenance.mutate('clear-stale-lock')}
                  disabled={maintenance.isPending}
               />
            </SettingRow>
            <SettingRow label="Clear audit log">
               <ConfirmActionButton
                  label="Clear audit log"
                  title="Clear audit log?"
                  description="Deletes .taskmaster/task-studio-audit.log."
                  confirmLabel="Clear"
                  variant="outline"
                  onConfirm={() => maintenance.mutate('clear-audit-log')}
                  disabled={maintenance.isPending}
               />
            </SettingRow>
         </SettingsCard>

         <SettingsCard
            title="Experimental features"
            description="Flags for features under development. Turning a flag on stores the preference; features activate as they ship."
         >
            <SwitchRow
               label="Auto-run on label"
               description="Start runs automatically when a task gets the ai-run label."
               checked={experimental.autoRunOnLabel}
               onChange={(autoRunOnLabel) => setExperimental({ autoRunOnLabel })}
            />
            <SwitchRow
               label="Webhook event delivery"
               description="Automatically deliver task/runner events to configured webhooks."
               checked={experimental.webhookDelivery}
               onChange={(webhookDelivery) => setExperimental({ webhookDelivery })}
            />
            <SwitchRow
               label="Git worktree per task"
               checked={experimental.worktreePerTask}
               onChange={(worktreePerTask) => setExperimental({ worktreePerTask })}
            />
            <SwitchRow
               label="PR creation after runs"
               checked={experimental.prCreation}
               onChange={(prCreation) => setExperimental({ prCreation })}
            />
            <SwitchRow
               label="Multi-agent runner"
               checked={experimental.multiAgent}
               onChange={(multiAgent) => setExperimental({ multiAgent })}
            />
            <SwitchRow
               label="SSE/WebSocket log streaming"
               checked={experimental.sseLogStreaming}
               onChange={(sseLogStreaming) => setExperimental({ sseLogStreaming })}
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
