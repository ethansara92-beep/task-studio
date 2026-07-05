'use client';

import { useTheme } from 'next-themes';
import { useSettingsSection } from '@/hooks/use-settings';
import {
   NumberField,
   SettingRow,
   SettingsCard,
   SettingsPage,
   SettingsSaveBar,
   SelectField,
   SwitchRow,
} from '../settings-ui';

export function PreferencesSection() {
   const form = useSettingsSection('preferences');
   const { draft, update } = form;
   const { setTheme } = useTheme();

   return (
      <SettingsPage
         title="Preferences"
         description="Personal appearance and refresh behavior for this machine."
      >
         <SettingsCard title="Appearance">
            <SettingRow label="Theme" description="Applies immediately; saved with this section.">
               <SelectField
                  value={draft.theme}
                  onChange={(theme) => {
                     update({ theme });
                     setTheme(theme);
                  }}
                  options={[
                     { value: 'system', label: 'System' },
                     { value: 'light', label: 'Light' },
                     { value: 'dark', label: 'Dark' },
                  ]}
               />
            </SettingRow>
            <SettingRow label="Density">
               <SelectField
                  value={draft.density}
                  onChange={(density) => update({ density })}
                  options={[
                     { value: 'comfortable', label: 'Comfortable' },
                     { value: 'compact', label: 'Compact' },
                  ]}
               />
            </SettingRow>
            <SettingRow label="Sidebar behavior">
               <SelectField
                  value={draft.sidebarBehavior}
                  onChange={(sidebarBehavior) => update({ sidebarBehavior })}
                  options={[
                     { value: 'expanded', label: 'Always expanded' },
                     { value: 'collapsed', label: 'Always collapsed' },
                     { value: 'remember', label: 'Remember last state' },
                  ]}
               />
            </SettingRow>
            <SettingRow label="Date & time format">
               <SelectField
                  value={draft.dateTimeFormat}
                  onChange={(dateTimeFormat) => update({ dateTimeFormat })}
                  options={[
                     { value: 'system', label: 'System default' },
                     { value: 'iso', label: 'ISO 8601' },
                     { value: 'relative', label: 'Relative (2h ago)' },
                  ]}
               />
            </SettingRow>
            <SettingRow label="Default task view" description="View used when opening a tag.">
               <SelectField
                  value={draft.defaultTaskView}
                  onChange={(defaultTaskView) => update({ defaultTaskView })}
                  options={[
                     { value: 'list', label: 'List' },
                     { value: 'board', label: 'Board' },
                  ]}
               />
            </SettingRow>
         </SettingsCard>

         <SettingsCard
            title="Data refresh"
            description="How often Task Studio re-reads task data and run logs."
         >
            <SwitchRow
               label="Auto-refresh task data"
               checked={draft.autoRefreshTasks}
               onChange={(autoRefreshTasks) => update({ autoRefreshTasks })}
            />
            <SettingRow label="Task refresh interval" description="500–10000 ms.">
               <NumberField
                  value={draft.taskRefreshIntervalMs}
                  onChange={(v) => v !== null && update({ taskRefreshIntervalMs: v })}
                  min={500}
                  max={10000}
                  step={100}
                  unit="ms"
               />
            </SettingRow>
            <SwitchRow
               label="Auto-refresh run logs"
               description="Poll the active run's log while it is running."
               checked={draft.logAutoRefresh}
               onChange={(logAutoRefresh) => update({ logAutoRefresh })}
            />
            <SettingRow label="Log refresh interval" description="500–10000 ms.">
               <NumberField
                  value={draft.logRefreshIntervalMs}
                  onChange={(v) => v !== null && update({ logRefreshIntervalMs: v })}
                  min={500}
                  max={10000}
                  step={100}
                  unit="ms"
               />
            </SettingRow>
            <SettingRow
               label="Max log size shown"
               description="Only the newest part of large logs is loaded (16–2048 KB)."
            >
               <NumberField
                  value={draft.maxLogSizeKb}
                  onChange={(v) => v !== null && update({ maxLogSizeKb: v })}
                  min={16}
                  max={2048}
                  step={16}
                  unit="KB"
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
