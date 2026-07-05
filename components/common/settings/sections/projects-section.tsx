'use client';

import * as React from 'react';
import { CheckCircle2, ChevronRight, Loader2, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { validateProjectRoot } from '@/lib/api/settings';
import { ProjectConfig } from '@/types/settings';
import { useSettingsSection } from '@/hooks/use-settings';
import {
   EnvVarsField,
   NumberField,
   SettingRow,
   SettingsCard,
   SettingsPage,
   SettingsSaveBar,
   SelectField,
   SwitchRow,
   TextField,
} from '../settings-ui';
import { ProjectRootField } from '../project-root-field';

type RootStatus = { state: 'checking' } | { state: 'valid' } | { state: 'invalid'; error: string };

function ProjectCard({
   project,
   isDefault,
   onChange,
   onRemove,
   onSetDefault,
}: {
   project: ProjectConfig;
   isDefault: boolean;
   onChange: (next: ProjectConfig) => void;
   onRemove: () => void;
   onSetDefault: () => void;
}) {
   const [open, setOpen] = React.useState(false);
   const [status, setStatus] = React.useState<RootStatus | null>(null);

   const checkStatus = async () => {
      setStatus({ state: 'checking' });
      const result = await validateProjectRoot(project.root);
      if (result.success && result.data?.ok) {
         setStatus({ state: 'valid' });
      } else {
         setStatus({
            state: 'invalid',
            error: result.data?.error || result.error || 'Inaccessible',
         });
      }
   };

   return (
      <div className="rounded-md border">
         <Collapsible open={open} onOpenChange={setOpen}>
            <div className="flex items-center gap-2 px-3 py-2.5">
               <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-2 min-w-0 flex-1 text-left">
                     <ChevronRight
                        className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-90')}
                     />
                     <span className="truncate text-sm font-mono">{project.root}</span>
                  </button>
               </CollapsibleTrigger>
               {isDefault && (
                  <Badge variant="secondary" className="text-[10px] uppercase">
                     default
                  </Badge>
               )}
               {status?.state === 'checking' && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
               )}
               {status?.state === 'valid' && (
                  <Badge variant="secondary" className="gap-1 text-green-600 dark:text-green-400">
                     <CheckCircle2 className="h-3 w-3" /> valid
                  </Badge>
               )}
               {status?.state === 'invalid' && (
                  <Badge variant="secondary" className="gap-1 text-red-600 dark:text-red-400">
                     <XCircle className="h-3 w-3" /> invalid
                  </Badge>
               )}
               <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={checkStatus}>
                  Check
               </Button>
               <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={onSetDefault}
                  disabled={isDefault}
               >
                  Set default
               </Button>
               <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-red-600"
                  onClick={onRemove}
               >
                  <Trash2 className="h-3.5 w-3.5" />
               </Button>
            </div>
            {status?.state === 'invalid' && (
               <p className="px-9 pb-2 text-xs text-red-600 dark:text-red-400">{status.error}</p>
            )}
            <CollapsibleContent className="border-t divide-y">
               <SwitchRow
                  label="Runner enabled"
                  description="Allow AI runs in this project."
                  checked={project.runnerEnabled}
                  onChange={(runnerEnabled) => onChange({ ...project, runnerEnabled })}
               />
               <SettingRow label="Default runner mode">
                  <SelectField
                     value={project.defaultRunnerMode}
                     onChange={(defaultRunnerMode) => onChange({ ...project, defaultRunnerMode })}
                     options={[
                        { value: 'run-task', label: 'Run specific task' },
                        { value: 'run-next', label: 'Run next task' },
                        { value: 'loop', label: 'Loop' },
                        { value: 'loop-sandbox', label: 'Sandbox loop' },
                     ]}
                  />
               </SettingRow>
               <SwitchRow
                  label="Prefer sandbox"
                  description="Default loop runs to the Docker sandbox."
                  checked={project.sandboxPreferred}
                  onChange={(sandboxPreferred) => onChange({ ...project, sandboxPreferred })}
               />
               <SettingRow
                  label="Max concurrent runs"
                  description="Values above 1 require worktrees/queueing that Task Studio does not provide yet - runs may conflict."
               >
                  <NumberField
                     value={project.maxConcurrentRuns}
                     onChange={(v) => v !== null && onChange({ ...project, maxConcurrentRuns: v })}
                     min={1}
                     max={4}
                  />
               </SettingRow>
               {project.maxConcurrentRuns > 1 && (
                  <p className="px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
                     ⚠ Parallel runs in one working copy can corrupt each other&apos;s changes. The
                     runner still enforces one run per project until worktree support lands.
                  </p>
               )}
               <SettingRow
                  label="Branch / worktree strategy"
                  description="Git worktree per task is planned but not implemented yet."
               >
                  <Badge
                     variant="secondary"
                     className="text-[10px] font-normal text-muted-foreground"
                  >
                     Not implemented yet
                  </Badge>
               </SettingRow>
               <SettingRow
                  label="PR creation"
                  description="Opening a pull request after a successful run is planned but not implemented yet."
               >
                  <Badge
                     variant="secondary"
                     className="text-[10px] font-normal text-muted-foreground"
                  >
                     Not implemented yet
                  </Badge>
               </SettingRow>
               <SettingRow
                  label="Taskmaster CLI override"
                  description="Executable path used instead of the global setting."
               >
                  <TextField
                     value={project.tmPathOverride}
                     onChange={(tmPathOverride) => onChange({ ...project, tmPathOverride })}
                     placeholder="(use global)"
                     mono
                  />
               </SettingRow>
               <SettingRow
                  label="Claude CLI override"
                  description="Executable path used instead of the global setting."
               >
                  <TextField
                     value={project.claudePathOverride}
                     onChange={(claudePathOverride) => onChange({ ...project, claudePathOverride })}
                     placeholder="(use global)"
                     mono
                  />
               </SettingRow>
               <SettingRow
                  label="Environment variables"
                  description="Passed to runner processes for this project."
                  vertical
               >
                  <EnvVarsField
                     values={project.env}
                     onChange={(env) => onChange({ ...project, env })}
                  />
               </SettingRow>
            </CollapsibleContent>
         </Collapsible>
      </div>
   );
}

export function ProjectsSection() {
   const form = useSettingsSection('projects');
   const { draft, replace } = form;

   const updateProject = (index: number, next: ProjectConfig) => {
      const items = [...draft.items];
      items[index] = next;
      replace({ ...draft, items });
   };

   return (
      <SettingsPage
         title="Projects"
         description="Configured Taskmaster project roots and per-project runner behavior. The runner executes only in the project Task Studio was started in; other entries are prepared for multi-project support."
      >
         <SettingsCard
            title="Project roots"
            description="Each entry must be an existing directory containing .taskmaster/tasks/tasks.json."
         >
            <div className="px-4 py-3 space-y-3">
               {draft.items.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                     No projects configured yet. Add the project you started Task Studio in to
                     customize its runner behavior.
                  </p>
               )}
               {draft.items.map((project, index) => (
                  <ProjectCard
                     key={project.root}
                     project={project}
                     isDefault={draft.defaultRoot === project.root}
                     onChange={(next) => updateProject(index, next)}
                     onRemove={() =>
                        replace({
                           defaultRoot:
                              draft.defaultRoot === project.root ? null : draft.defaultRoot,
                           items: draft.items.filter((_, i) => i !== index),
                        })
                     }
                     onSetDefault={() => replace({ ...draft, defaultRoot: project.root })}
                  />
               ))}
               <ProjectRootField
                  buttonLabel="Add project"
                  onValid={(root) => {
                     if (draft.items.some((p) => p.root === root)) return;
                     replace({
                        ...draft,
                        items: [
                           ...draft.items,
                           {
                              root,
                              runnerEnabled: true,
                              defaultRunnerMode: 'run-task',
                              sandboxPreferred: false,
                              maxConcurrentRuns: 1,
                              tmPathOverride: '',
                              claudePathOverride: '',
                              env: {},
                           },
                        ],
                     });
                  }}
               />
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
