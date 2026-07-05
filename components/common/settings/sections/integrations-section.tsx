'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { WEBHOOK_EVENTS } from '@/types/settings';
import { testWebhook } from '@/lib/api/settings';
import { useSettingsSection } from '@/hooks/use-settings';
import {
   PlaceholderBadge,
   SecretField,
   SettingRow,
   SettingsCard,
   SettingsPage,
   SettingsSaveBar,
   SwitchRow,
   TextField,
} from '../settings-ui';

export function IntegrationsSection() {
   const form = useSettingsSection('integrations');
   const { draft, replace } = form;
   const [testingCustom, setTestingCustom] = React.useState(false);

   const testCustom = async () => {
      setTestingCustom(true);
      const result = await testWebhook({ target: 'custom' });
      setTestingCustom(false);
      if (result.success && result.data?.ok) toast.success('Custom webhook reachable');
      else toast.error(result.data?.error || result.error || 'Test failed');
   };

   return (
      <SettingsPage
         title="Integrations"
         description="Connections to external tools. Task Studio is a local app - integrations that need OAuth or secure token storage are honest placeholders until that exists."
      >
         <SettingsCard title="GitHub">
            <SwitchRow
               label="Enable GitHub integration"
               description="Stores repository context for future PR creation and issue linking."
               checked={draft.github.enabled}
               onChange={(enabled) => replace({ ...draft, github: { ...draft.github, enabled } })}
            />
            <SettingRow label="Repository URL">
               <TextField
                  value={draft.github.repoUrl}
                  onChange={(repoUrl) =>
                     replace({ ...draft, github: { ...draft.github, repoUrl } })
                  }
                  placeholder="https://github.com/owner/repo"
               />
            </SettingRow>
            <SettingRow label="Default branch">
               <TextField
                  value={draft.github.defaultBranch}
                  onChange={(defaultBranch) =>
                     replace({ ...draft, github: { ...draft.github, defaultBranch } })
                  }
                  placeholder="main"
                  className="w-40"
               />
            </SettingRow>
            <SettingRow label="PR creation after runs">
               <PlaceholderBadge />
            </SettingRow>
            <SettingRow label="Issue linking">
               <PlaceholderBadge />
            </SettingRow>
            <SettingRow
               label="Access token"
               description="Task Studio has no secure secret storage yet; use the gh CLI's own authentication instead of saving tokens here."
            >
               <Badge variant="secondary" className="text-[10px] font-normal text-muted-foreground">
                  Not supported - no secure storage
               </Badge>
            </SettingRow>
         </SettingsCard>

         <SettingsCard title="GitLab">
            <SwitchRow
               label="Enable GitLab integration"
               checked={draft.gitlab.enabled}
               onChange={(enabled) => replace({ ...draft, gitlab: { ...draft.gitlab, enabled } })}
            />
            <SettingRow label="Repository URL">
               <TextField
                  value={draft.gitlab.repoUrl}
                  onChange={(repoUrl) =>
                     replace({ ...draft, gitlab: { ...draft.gitlab, repoUrl } })
                  }
                  placeholder="https://gitlab.com/owner/repo"
               />
            </SettingRow>
            <SettingRow label="Default branch">
               <TextField
                  value={draft.gitlab.defaultBranch}
                  onChange={(defaultBranch) =>
                     replace({ ...draft, gitlab: { ...draft.gitlab, defaultBranch } })
                  }
                  placeholder="main"
                  className="w-40"
               />
            </SettingRow>
            <SettingRow label="MR creation after runs">
               <PlaceholderBadge />
            </SettingRow>
         </SettingsCard>

         <SettingsCard
            title="Linear"
            description="Issue import and status sync are planned. API keys are not stored until secure storage exists."
         >
            <SwitchRow
               label="Enable Linear integration"
               checked={draft.linear.enabled}
               onChange={(enabled) => replace({ ...draft, linear: { enabled } })}
            />
            <SettingRow label="Workspace / team mapping">
               <PlaceholderBadge />
            </SettingRow>
            <SettingRow label="Import Linear issues">
               <PlaceholderBadge />
            </SettingRow>
            <SettingRow label="Sync statuses">
               <PlaceholderBadge />
            </SettingRow>
         </SettingsCard>

         <SettingsCard
            title="Slack & Discord"
            description="Configured under Settings → Notifications (incoming webhook URLs with test buttons)."
         >
            <SettingRow label="Slack / Discord webhooks">
               <Badge variant="secondary" className="text-[10px] font-normal text-muted-foreground">
                  See Notifications
               </Badge>
            </SettingRow>
         </SettingsCard>

         <SettingsCard
            title="Local Git & MCP"
            description="Git worktree automation and MCP server management are planned; Taskmaster's own MCP config lives in .mcp.json."
         >
            <SettingRow label="Git worktree per task">
               <PlaceholderBadge />
            </SettingRow>
            <SettingRow label="MCP server configuration">
               <PlaceholderBadge label="Managed via .mcp.json" />
            </SettingRow>
         </SettingsCard>

         <SettingsCard
            title="Custom integration"
            description="A generic outgoing webhook with event filters."
         >
            <SwitchRow
               label="Enabled"
               checked={draft.custom.enabled}
               onChange={(enabled) => replace({ ...draft, custom: { ...draft.custom, enabled } })}
            />
            <SettingRow label="Name">
               <TextField
                  value={draft.custom.name}
                  onChange={(name) => replace({ ...draft, custom: { ...draft.custom, name } })}
                  placeholder="My automation"
               />
            </SettingRow>
            <SettingRow label="Description">
               <TextField
                  value={draft.custom.description}
                  onChange={(description) =>
                     replace({ ...draft, custom: { ...draft.custom, description } })
                  }
               />
            </SettingRow>
            <SettingRow
               label="Outgoing webhook URL"
               description="https:// required (http:// allowed for localhost). Masked after save."
               vertical
            >
               <div className="flex items-center gap-2">
                  <SecretField
                     value={draft.custom.webhookUrl}
                     onChange={(webhookUrl) =>
                        replace({ ...draft, custom: { ...draft.custom, webhookUrl } })
                     }
                     placeholder="https://example.com/hook"
                     className="flex-1 w-auto"
                  />
                  <Button
                     variant="outline"
                     size="sm"
                     onClick={testCustom}
                     disabled={!draft.custom.webhookUrl || form.isDirty || testingCustom}
                  >
                     {testingCustom && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                     Test
                  </Button>
               </div>
            </SettingRow>
            <SettingRow label="Events" vertical>
               <div className="grid grid-cols-2 gap-2">
                  {WEBHOOK_EVENTS.map((event) => (
                     <label key={event} className="flex items-center gap-2 text-xs font-mono">
                        <Checkbox
                           checked={draft.custom.events.includes(event)}
                           onCheckedChange={(checked) =>
                              replace({
                                 ...draft,
                                 custom: {
                                    ...draft.custom,
                                    events: checked
                                       ? [...draft.custom.events, event]
                                       : draft.custom.events.filter((e) => e !== event),
                                 },
                              })
                           }
                        />
                        {event}
                     </label>
                  ))}
               </div>
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
