'use client';

import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { useSettingsSection } from '@/hooks/use-settings';
import { useTags } from '@/hooks/use-taskmaster-queries';
import {
   SettingRow,
   SettingsCard,
   SettingsPage,
   SettingsSaveBar,
   SelectField,
   TextField,
} from '../settings-ui';

export function WorkspaceSection() {
   const form = useSettingsSection('workspace');
   const { draft, update } = form;
   const { data: tags } = useTags();

   const tagOptions = (tags ?? []).map((tag) => ({ value: tag.name, label: tag.name }));
   if (!tagOptions.some((o) => o.value === draft.defaultTag)) {
      tagOptions.unshift({ value: draft.defaultTag, label: draft.defaultTag });
   }

   return (
      <SettingsPage
         title="Workspace"
         description="Identity and defaults for this workspace. Task Studio is single-workspace today; the structure supports multiple workspaces later."
      >
         <SettingsCard title="Identity">
            <SettingRow label="Name">
               <TextField
                  value={draft.name}
                  onChange={(name) => update({ name })}
                  placeholder="My Workspace"
               />
            </SettingRow>
            <SettingRow label="Initials" description="Up to 3 characters, shown as the icon.">
               <TextField
                  value={draft.initials}
                  onChange={(initials) => update({ initials: initials.slice(0, 3).toUpperCase() })}
                  placeholder="MW"
                  className="w-20"
               />
            </SettingRow>
            <SettingRow label="Description" vertical>
               <Textarea
                  value={draft.description}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder="What this workspace is for…"
                  className="text-sm min-h-16"
               />
            </SettingRow>
         </SettingsCard>

         <SettingsCard title="Defaults">
            <SettingRow
               label="Default tag"
               description="Taskmaster tag treated as this workspace's default context."
            >
               <SelectField
                  value={draft.defaultTag}
                  onChange={(defaultTag) => update({ defaultTag })}
                  options={tagOptions}
               />
            </SettingRow>
            <SettingRow
               label="Runner policy"
               description="Workspace-level stance on AI runs; the Runner and Security sections refine it."
            >
               <SelectField
                  value={draft.runnerPolicy}
                  onChange={(runnerPolicy) => update({ runnerPolicy })}
                  options={[
                     { value: 'allow', label: 'Allow runner' },
                     { value: 'require-confirmation', label: 'Require confirmation' },
                     { value: 'sandbox-preferred', label: 'Prefer sandbox' },
                  ]}
               />
            </SettingRow>
         </SettingsCard>

         <SettingsCard title="Metadata">
            <SettingRow label="Created">
               <span className="text-sm text-muted-foreground">
                  {draft.createdAt ? format(new Date(draft.createdAt), 'PPp') : 'Not saved yet'}
               </span>
            </SettingRow>
            <SettingRow label="Last updated">
               <span className="text-sm text-muted-foreground">
                  {draft.updatedAt ? format(new Date(draft.updatedAt), 'PPp') : 'Not saved yet'}
               </span>
            </SettingRow>
            <SettingRow label="Config version">
               <span className="text-sm text-muted-foreground font-mono">
                  {form.settings?.version ?? 1}
               </span>
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
