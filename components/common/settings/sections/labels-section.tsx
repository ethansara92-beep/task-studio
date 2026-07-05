'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSettingsSection } from '@/hooks/use-settings';
import { LabelConfig } from '@/types/settings';
import {
   SettingRow,
   SettingsCard,
   SettingsPage,
   SettingsSaveBar,
   SelectField,
} from '../settings-ui';

function LabelRow({
   label,
   onChange,
   onRemove,
}: {
   label: LabelConfig;
   onChange: (next: LabelConfig) => void;
   onRemove: () => void;
}) {
   return (
      <div className="flex items-center gap-2 px-4 py-2">
         <input
            type="color"
            value={label.color}
            onChange={(e) => onChange({ ...label, color: e.target.value })}
            className="h-6 w-6 shrink-0 cursor-pointer rounded border bg-transparent p-0"
            title="Label color"
         />
         <span
            className="rounded-full px-2 py-0.5 text-xs font-medium shrink-0"
            style={{ backgroundColor: `${label.color}20`, color: label.color }}
         >
            {label.name}
         </span>
         <Input
            value={label.description}
            placeholder="Description…"
            onChange={(e) => onChange({ ...label, description: e.target.value })}
            className="h-7 flex-1 text-xs"
         />
         <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-red-600"
            onClick={onRemove}
         >
            <Trash2 className="h-3.5 w-3.5" />
         </Button>
      </div>
   );
}

export function LabelsSection() {
   const form = useSettingsSection('labels');
   const { draft, replace, update } = form;
   const [newName, setNewName] = React.useState('');
   const [error, setError] = React.useState<string | null>(null);

   const addLabel = () => {
      const name = newName.trim().toLowerCase();
      if (!name) return;
      if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
         setError('Lowercase letters, digits and hyphens only');
         return;
      }
      if (draft.items.some((l) => l.name === name)) {
         setError('Label already exists');
         return;
      }
      setError(null);
      replace({
         ...draft,
         items: [...draft.items, { name, color: '#6366f1', description: '' }],
      });
      setNewName('');
   };

   const labelOptions = draft.items.map((l) => ({ value: l.name, label: l.name }));

   return (
      <SettingsPage
         title="Labels"
         description="Labels managed by Task Studio for organizing and automating tasks. Taskmaster task files are never modified by editing labels here."
      >
         <SettingsCard title="Labels">
            <div className="divide-y">
               {draft.items.map((label, index) => (
                  <LabelRow
                     key={label.name}
                     label={label}
                     onChange={(next) => {
                        const items = [...draft.items];
                        items[index] = next;
                        replace({ ...draft, items });
                     }}
                     onRemove={() =>
                        replace({ ...draft, items: draft.items.filter((_, i) => i !== index) })
                     }
                  />
               ))}
               {draft.items.length === 0 && (
                  <p className="px-4 py-3 text-xs text-muted-foreground">
                     No labels yet. Reset settings to restore the default set, or add your own.
                  </p>
               )}
            </div>
            <div className="px-4 py-3 border-t space-y-1.5">
               <div className="flex items-center gap-2">
                  <Input
                     value={newName}
                     placeholder="new-label-name"
                     onChange={(e) => {
                        setNewName(e.target.value);
                        setError(null);
                     }}
                     onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                           e.preventDefault();
                           addLabel();
                        }
                     }}
                     className="h-8 text-sm font-mono"
                  />
                  <Button variant="outline" size="sm" onClick={addLabel}>
                     <Plus className="h-3.5 w-3.5" />
                     Add label
                  </Button>
               </div>
               {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            </div>
         </SettingsCard>

         <SettingsCard
            title="Label automation"
            description="Which labels have special meaning. Automatic runs on label changes stay off until the experimental auto-run engine ships (Settings → Developer)."
         >
            <SettingRow label="AI-run label" description="Marks a task as eligible for the runner.">
               <SelectField
                  value={draft.aiRunLabel}
                  onChange={(aiRunLabel) => update({ aiRunLabel })}
                  options={
                     labelOptions.some((o) => o.value === draft.aiRunLabel)
                        ? labelOptions
                        : [{ value: draft.aiRunLabel, label: draft.aiRunLabel }, ...labelOptions]
                  }
               />
            </SettingRow>
            <SettingRow
               label="Needs-review label"
               description="Marks a task for manual review after a run."
            >
               <SelectField
                  value={draft.needsReviewLabel}
                  onChange={(needsReviewLabel) => update({ needsReviewLabel })}
                  options={
                     labelOptions.some((o) => o.value === draft.needsReviewLabel)
                        ? labelOptions
                        : [
                             { value: draft.needsReviewLabel, label: draft.needsReviewLabel },
                             ...labelOptions,
                          ]
                  }
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
