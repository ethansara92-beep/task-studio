'use client';

import { format } from 'date-fns';
import { useMaintenance, useSettingsSection } from '@/hooks/use-settings';
import { useRunnerStatus } from '@/hooks/use-runner';
import { RunStatusBadge } from '@/components/runner/run-status-badge';
import {
   AdvancedGroup,
   ConfirmActionButton,
   NumberField,
   PlaceholderBadge,
   SettingRow,
   SettingsCard,
   SettingsPage,
   SettingsSaveBar,
   SelectField,
   SwitchRow,
} from '../settings-ui';

export function RunnerSection() {
   const form = useSettingsSection('runner');
   const { draft, update } = form;
   const maintenance = useMaintenance();
   const { data: runnerStatus } = useRunnerStatus();

   return (
      <SettingsPage
         title="Runner"
         description="How the local Taskmaster runner executes, retains history, and stops. Logs and metadata are stored under .taskmaster/runs/."
      >
         <SettingsCard title="Execution">
            <SwitchRow
               label="Enable local runner"
               description="When off, all run requests are rejected."
               checked={draft.enabled}
               onChange={(enabled) => update({ enabled })}
            />
            <SettingRow label="Default runner mode">
               <SelectField
                  value={draft.defaultMode}
                  onChange={(defaultMode) => update({ defaultMode })}
                  options={[
                     { value: 'run-task', label: 'Run specific task' },
                     { value: 'run-next', label: 'Run next task' },
                     { value: 'loop', label: 'Loop' },
                     { value: 'loop-sandbox', label: 'Sandbox loop' },
                  ]}
               />
            </SettingRow>
            <SwitchRow
               label="One active run per project"
               description="Enforced for now - parallel runs need worktrees/queueing that are not implemented yet."
               checked={true}
               onChange={() => {}}
               disabled
            />
            <SettingRow
               label="Queue behavior"
               description="Runs started while another is active are rejected. A FIFO queue is planned."
            >
               <PlaceholderBadge label="FIFO queue planned" />
            </SettingRow>
            <SwitchRow
               label="Show live logs"
               description="Display the log viewer in the runner panel."
               checked={draft.showLiveLogs}
               onChange={(showLiveLogs) => update({ showLiveLogs })}
            />
         </SettingsCard>

         <SettingsCard title="Retention & lifecycle">
            <SettingRow
               label="Keep last runs"
               description="Older run records and logs are deleted."
            >
               <NumberField
                  value={draft.historyLimit}
                  onChange={(v) => v !== null && update({ historyLimit: v })}
                  min={5}
                  max={500}
                  unit="runs"
               />
            </SettingRow>
            <SettingRow label="Keep logs for">
               <NumberField
                  value={draft.logRetentionDays}
                  onChange={(v) => v !== null && update({ logRetentionDays: v })}
                  min={1}
                  max={365}
                  unit="days"
               />
            </SettingRow>
            <AdvancedGroup>
               <SettingRow
                  label="Stop grace timeout"
                  description="Time between SIGTERM and SIGKILL when stopping a run."
               >
                  <NumberField
                     value={draft.stopGraceTimeoutMs}
                     onChange={(v) => v !== null && update({ stopGraceTimeoutMs: v })}
                     min={1000}
                     max={60000}
                     step={500}
                     unit="ms"
                  />
               </SettingRow>
               <SettingRow
                  label="Stale lock timeout"
                  description="How long a lock without a live process is tolerated before being treated as stale."
               >
                  <NumberField
                     value={draft.staleLockTimeoutMinutes}
                     onChange={(v) => v !== null && update({ staleLockTimeoutMinutes: v })}
                     min={1}
                     max={1440}
                     unit="min"
                  />
               </SettingRow>
            </AdvancedGroup>
         </SettingsCard>

         <SettingsCard title="Current state">
            <SettingRow label="Active run">
               {runnerStatus?.activeRun ? (
                  <div className="flex items-center gap-2 text-sm">
                     <RunStatusBadge status={runnerStatus.activeRun.status} />
                     <span className="font-mono text-xs text-muted-foreground">
                        {runnerStatus.activeRun.runId}
                     </span>
                  </div>
               ) : (
                  <RunStatusBadge status="idle" />
               )}
            </SettingRow>
            <div className="px-4 py-3">
               <div className="text-sm font-medium mb-2">Recent runs</div>
               {runnerStatus?.recentRuns?.length ? (
                  <div className="space-y-1">
                     {runnerStatus.recentRuns.slice(0, 8).map((run) => (
                        <div key={run.runId} className="flex items-center gap-2 text-xs">
                           <RunStatusBadge status={run.status} />
                           <span className="font-mono text-muted-foreground truncate">
                              {run.runId}
                           </span>
                           <span className="text-muted-foreground">{run.mode}</span>
                           <span className="text-muted-foreground ml-auto shrink-0">
                              {format(new Date(run.startedAt), 'MMM dd HH:mm')}
                           </span>
                        </div>
                     ))}
                  </div>
               ) : (
                  <p className="text-xs text-muted-foreground">No runs yet.</p>
               )}
            </div>
         </SettingsCard>

         <SettingsCard title="Maintenance">
            <SettingRow
               label="Clear run history"
               description="Deletes all finished run records and logs under .taskmaster/runs/."
            >
               <ConfirmActionButton
                  label="Clear history"
                  title="Clear run history?"
                  description="All finished run records and log files will be deleted. The active run (if any) is kept."
                  confirmLabel="Delete"
                  onConfirm={() => maintenance.mutate('clear-run-history')}
                  disabled={maintenance.isPending}
               />
            </SettingRow>
            <SettingRow
               label="Clear stale runner lock"
               description="Removes .taskmaster/runner.lock when its process is no longer alive."
            >
               <ConfirmActionButton
                  label="Clear stale lock"
                  title="Clear stale lock?"
                  description="Only proceeds if the lock's process is dead. A live run is never unlocked."
                  confirmLabel="Clear"
                  variant="outline"
                  onConfirm={() => maintenance.mutate('clear-stale-lock')}
                  disabled={maintenance.isPending}
               />
            </SettingRow>
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
