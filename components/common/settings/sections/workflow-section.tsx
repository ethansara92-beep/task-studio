'use client';

import { Badge } from '@/components/ui/badge';
import { useSettingsSection } from '@/hooks/use-settings';
import {
   PlaceholderBadge,
   SettingRow,
   SettingsCard,
   SettingsPage,
   SettingsSaveBar,
   SelectField,
} from '../settings-ui';

/** Taskmaster's status model is fixed - shown read-only, mapped below. */
const TASKMASTER_STATUSES = ['pending', 'in-progress', 'done', 'cancelled'] as const;

const STATUS_OPTIONS = TASKMASTER_STATUSES.map((s) => ({ value: s, label: s }));

export function WorkflowSection() {
   const form = useSettingsSection('workflow');
   const { draft, update } = form;

   return (
      <SettingsPage
         title="Workflow"
         description="How task statuses map to runner behavior. Taskmaster's status set is fixed, so statuses are read-only and mapped rather than edited."
      >
         <SettingsCard
            title="Statuses"
            description="Defined by Taskmaster and shown here for reference - editing the status list is not supported by the Taskmaster data model."
         >
            <div className="px-4 py-3 flex flex-wrap gap-1.5">
               {TASKMASTER_STATUSES.map((status) => (
                  <Badge key={status} variant="secondary" className="font-mono text-xs">
                     {status}
                  </Badge>
               ))}
            </div>
         </SettingsCard>

         <SettingsCard title="Status mapping">
            <SettingRow label="Default status for new tasks">
               <SelectField
                  value={draft.defaultStatus}
                  onChange={(defaultStatus) => update({ defaultStatus })}
                  options={STATUS_OPTIONS}
               />
            </SettingRow>
            <SettingRow label="Ready for AI" description="Tasks in this status are runnable.">
               <SelectField
                  value={draft.readyStatus}
                  onChange={(readyStatus) => update({ readyStatus })}
                  options={STATUS_OPTIONS}
               />
            </SettingRow>
            <SettingRow label="In progress">
               <SelectField
                  value={draft.inProgressStatus}
                  onChange={(inProgressStatus) => update({ inProgressStatus })}
                  options={STATUS_OPTIONS}
               />
            </SettingRow>
            <SettingRow label="Done">
               <SelectField
                  value={draft.doneStatus}
                  onChange={(doneStatus) => update({ doneStatus })}
                  options={STATUS_OPTIONS}
               />
            </SettingRow>
            <SettingRow label="Blocked">
               <SelectField
                  value={draft.blockedStatus}
                  onChange={(blockedStatus) => update({ blockedStatus })}
                  options={STATUS_OPTIONS}
               />
            </SettingRow>
         </SettingsCard>

         <SettingsCard title="Automation">
            <SettingRow
               label="Auto-run trigger"
               description="Manual is the only active mode today - automatic triggers require the experimental auto-run engine (Settings → Developer). Off by default for safety."
            >
               <SelectField
                  value={draft.autoRunTrigger}
                  onChange={(autoRunTrigger) => update({ autoRunTrigger })}
                  options={[
                     { value: 'manual', label: 'Manual only' },
                     { value: 'on-ready-status', label: 'When task becomes ready' },
                     { value: 'on-ai-run-label', label: 'When task has ai-run label' },
                  ]}
               />
            </SettingRow>
            {draft.autoRunTrigger !== 'manual' && (
               <p className="px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
                  ⚠ Automatic triggers are stored but not executed yet - runs still start manually.
                  This preference will take effect when the auto-run engine ships.
               </p>
            )}
            <SettingRow
               label="Dependency behavior"
               description="What happens when you run a task whose dependencies are not done. Enforced by the runner API."
            >
               <SelectField
                  value={draft.dependencyBehavior}
                  onChange={(dependencyBehavior) => update({ dependencyBehavior })}
                  options={[
                     { value: 'block', label: 'Block the run' },
                     { value: 'warn', label: 'Warn but run' },
                     { value: 'ignore', label: 'Ignore' },
                  ]}
               />
            </SettingRow>
            <SettingRow
               label="WIP limits"
               description="Per-status and per-project limits are planned."
            >
               <PlaceholderBadge />
            </SettingRow>
            <SettingRow label="Auto-archive completed tasks">
               <PlaceholderBadge />
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
