'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useResetSettings, useSettingsSection } from '@/hooks/use-settings';
import {
   ConfirmActionButton,
   SettingRow,
   SettingsCard,
   SettingsPage,
   SettingsSaveBar,
   SelectField,
   SwitchRow,
   TextField,
} from '../settings-ui';
import { ProjectRootField } from '../project-root-field';

export function GeneralSection() {
   const form = useSettingsSection('general');
   const reset = useResetSettings();
   const { draft, update } = form;

   return (
      <SettingsPage
         title="General"
         description="Workspace-wide basics: project roots, startup behavior, and confirmations."
      >
         <SettingsCard title="Application">
            <SettingRow label="Display name" description="Shown in the app header and exports.">
               <TextField
                  value={draft.displayName}
                  onChange={(displayName) => update({ displayName })}
                  placeholder="Task Studio"
               />
            </SettingRow>
            <SettingRow
               label="Startup behavior"
               description="What Task Studio opens when it starts."
            >
               <SelectField
                  value={draft.startupBehavior}
                  onChange={(startupBehavior) => update({ startupBehavior })}
                  options={[
                     { value: 'last-project', label: 'Open last project' },
                     { value: 'default-project', label: 'Open default project' },
                     { value: 'project-picker', label: 'Show project picker' },
                  ]}
               />
            </SettingRow>
         </SettingsCard>

         <SettingsCard
            title="Project root allowlist"
            description="When the allowlist is not empty, the runner refuses to execute in any project root that is not listed. Paths are validated: they must exist and contain .taskmaster/tasks/tasks.json."
         >
            <div className="px-4 py-3 space-y-3">
               {draft.projectRootAllowlist.length > 0 ? (
                  <div className="space-y-1">
                     {draft.projectRootAllowlist.map((root) => (
                        <div key={root} className="flex items-center gap-2 text-xs font-mono">
                           <span className="flex-1 truncate rounded bg-muted px-2 py-1">
                              {root}
                           </span>
                           {draft.defaultProjectRoot === root && (
                              <span className="text-[10px] text-muted-foreground uppercase">
                                 default
                              </span>
                           )}
                           <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() =>
                                 update({
                                    defaultProjectRoot: root,
                                 })
                              }
                              disabled={draft.defaultProjectRoot === root}
                           >
                              Set default
                           </Button>
                           <button
                              onClick={() =>
                                 update({
                                    projectRootAllowlist: draft.projectRootAllowlist.filter(
                                       (r) => r !== root
                                    ),
                                    defaultProjectRoot:
                                       draft.defaultProjectRoot === root
                                          ? null
                                          : draft.defaultProjectRoot,
                                 })
                              }
                              className="text-muted-foreground hover:text-foreground"
                           >
                              <X className="h-3.5 w-3.5" />
                           </button>
                        </div>
                     ))}
                  </div>
               ) : (
                  <p className="text-xs text-muted-foreground">
                     Allowlist is empty - the runner only executes in the project Task Studio was
                     started in.
                  </p>
               )}
               <ProjectRootField
                  onValid={(root) => {
                     if (!draft.projectRootAllowlist.includes(root)) {
                        update({ projectRootAllowlist: [...draft.projectRootAllowlist, root] });
                     }
                  }}
               />
            </div>
         </SettingsCard>

         <SettingsCard title="Confirmations">
            <SwitchRow
               label="Confirm before running agent tasks"
               description="Ask before starting any Claude Code run."
               checked={draft.confirmBeforeRun}
               onChange={(confirmBeforeRun) => update({ confirmBeforeRun })}
            />
            <SwitchRow
               label="Confirm before stopping an active run"
               description="Ask before cancelling a run in progress."
               checked={draft.confirmBeforeStop}
               onChange={(confirmBeforeStop) => update({ confirmBeforeStop })}
            />
            <SwitchRow
               label="Confirm before resetting settings"
               description="Ask before restoring all settings to defaults."
               checked={draft.confirmBeforeReset}
               onChange={(confirmBeforeReset) => update({ confirmBeforeReset })}
            />
         </SettingsCard>

         <SettingsCard
            title="Danger zone"
            description="A backup of the current settings file is written before resetting."
         >
            <SettingRow
               label="Reset all settings"
               description="Restores every section to its default values."
            >
               <ConfirmActionButton
                  label="Reset all settings"
                  title="Reset all settings?"
                  description="All sections will be restored to defaults. Secrets are removed. A backup file is written next to the settings file."
                  confirmLabel="Reset everything"
                  onConfirm={() => reset.mutate()}
                  disabled={reset.isPending}
                  skipConfirm={!draft.confirmBeforeReset}
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
