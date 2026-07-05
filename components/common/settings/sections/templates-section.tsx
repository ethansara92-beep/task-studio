'use client';

import * as React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { DEFAULT_TEMPLATES, TEMPLATE_VARIABLES } from '@/types/settings';
import { useSettingsSection } from '@/hooks/use-settings';
import {
   ConfirmActionButton,
   SettingRow,
   SettingsCard,
   SettingsPage,
   SettingsSaveBar,
   SelectField,
} from '../settings-ui';

const SAMPLE_VALUES: Record<(typeof TEMPLATE_VARIABLES)[number], string> = {
   taskId: '12',
   taskTitle: 'Add user authentication',
   taskDescription: 'Implement login with OAuth and session handling.',
   projectRoot: '/home/me/my-project',
   dependencies: '3, 7',
   priority: 'high',
   status: 'pending',
};

/** Plain text substitution - templates can never become commands. */
function renderTemplate(content: string): string {
   return content.replace(/\{\{(\w+)\}\}/g, (match, name) => {
      return name in SAMPLE_VALUES ? SAMPLE_VALUES[name as keyof typeof SAMPLE_VALUES] : match;
   });
}

export function TemplatesSection() {
   const form = useSettingsSection('templates');
   const { draft, update, replace } = form;
   const [selectedId, setSelectedId] = React.useState(draft.items[0]?.id ?? '');

   const selected = draft.items.find((t) => t.id === selectedId) ?? draft.items[0] ?? null;

   return (
      <SettingsPage
         title="Templates"
         description="Prompt templates used when composing runner prompts. Templates are plain text with {{variable}} substitution - they are never executed as commands."
      >
         <SettingsCard
            title="Prompt wrapper"
            description="Text placed before and after every generated prompt."
         >
            <SettingRow label="Prompt prefix" vertical>
               <Textarea
                  value={draft.promptPrefix}
                  onChange={(e) => update({ promptPrefix: e.target.value })}
                  placeholder="e.g. Follow the project conventions in CLAUDE.md."
                  className="text-sm font-mono min-h-16"
               />
            </SettingRow>
            <SettingRow label="Prompt suffix" vertical>
               <Textarea
                  value={draft.promptSuffix}
                  onChange={(e) => update({ promptSuffix: e.target.value })}
                  placeholder="e.g. Run the test suite before finishing."
                  className="text-sm font-mono min-h-16"
               />
            </SettingRow>
         </SettingsCard>

         <SettingsCard
            title="Task templates"
            description="Reusable prompt bodies per work type."
            actions={
               <ConfirmActionButton
                  label="Reset to defaults"
                  title="Reset templates?"
                  description="All templates will be replaced with the built-in defaults. Custom templates are lost."
                  confirmLabel="Reset templates"
                  variant="outline"
                  onConfirm={() =>
                     replace({ ...draft, items: DEFAULT_TEMPLATES.map((t) => ({ ...t })) })
                  }
               />
            }
         >
            <SettingRow label="Template">
               <SelectField
                  value={selected?.id ?? ''}
                  onChange={(id) => setSelectedId(id)}
                  options={draft.items.map((t) => ({ value: t.id, label: t.name }))}
               />
            </SettingRow>
            {selected && (
               <>
                  <SettingRow label="Content" vertical>
                     <Textarea
                        value={selected.content}
                        onChange={(e) =>
                           replace({
                              ...draft,
                              items: draft.items.map((t) =>
                                 t.id === selected.id ? { ...t, content: e.target.value } : t
                              ),
                           })
                        }
                        className="text-sm font-mono min-h-40"
                     />
                  </SettingRow>
                  <SettingRow
                     label="Preview"
                     description="Rendered with sample values, wrapped in the prefix/suffix."
                     vertical
                  >
                     <pre className="w-full rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
                        {[draft.promptPrefix, renderTemplate(selected.content), draft.promptSuffix]
                           .filter(Boolean)
                           .join('\n\n')}
                     </pre>
                  </SettingRow>
               </>
            )}
            <div className="px-4 py-3">
               <div className="text-xs text-muted-foreground mb-1.5">Available variables</div>
               <div className="flex flex-wrap gap-1.5">
                  {TEMPLATE_VARIABLES.map((variable) => (
                     <Badge key={variable} variant="secondary" className="font-mono text-[10px]">
                        {'{{'}
                        {variable}
                        {'}}'}
                     </Badge>
                  ))}
               </div>
            </div>
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
