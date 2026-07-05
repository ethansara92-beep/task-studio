'use client';

import * as React from 'react';
import { ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { WEBHOOK_EVENTS, WebhookEndpoint } from '@/types/settings';
import { testWebhook } from '@/lib/api/settings';
import { useSettingsSection } from '@/hooks/use-settings';
import {
   NumberField,
   PlaceholderBadge,
   SecretField,
   SettingRow,
   SettingsCard,
   SettingsPage,
   SettingsSaveBar,
   SwitchRow,
   TextField,
} from '../settings-ui';

function EndpointEditor({
   endpoint,
   isDirtySection,
   onChange,
   onRemove,
}: {
   endpoint: WebhookEndpoint;
   isDirtySection: boolean;
   onChange: (next: WebhookEndpoint) => void;
   onRemove: () => void;
}) {
   const [open, setOpen] = React.useState(false);
   const [testing, setTesting] = React.useState(false);

   const runTest = async () => {
      setTesting(true);
      const result = await testWebhook({ target: 'endpoint', endpointId: endpoint.id });
      setTesting(false);
      if (result.success && result.data?.ok) {
         toast.success(`Webhook delivered (${result.data.status})`);
      } else {
         toast.error(result.data?.error || result.error || 'Delivery failed');
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
                     <span className="text-sm font-medium truncate">
                        {endpoint.name || 'Unnamed endpoint'}
                     </span>
                     <span className="text-xs text-muted-foreground truncate">{endpoint.url}</span>
                  </button>
               </CollapsibleTrigger>
               <Switch
                  checked={endpoint.enabled}
                  onCheckedChange={(enabled) => onChange({ ...endpoint, enabled })}
               />
               <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={runTest}
                  disabled={testing || isDirtySection}
                  title={isDirtySection ? 'Save changes before testing' : undefined}
               >
                  {testing && <Loader2 className="h-3 w-3 animate-spin" />}
                  Test
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
            <CollapsibleContent className="border-t divide-y">
               <SettingRow label="Name">
                  <TextField
                     value={endpoint.name}
                     onChange={(name) => onChange({ ...endpoint, name })}
                     placeholder="CI notifier"
                  />
               </SettingRow>
               <SettingRow
                  label="URL"
                  description="https:// required; http:// allowed for localhost only."
               >
                  <TextField
                     value={endpoint.url}
                     onChange={(url) => onChange({ ...endpoint, url })}
                     placeholder="https://example.com/hooks/task-studio"
                     mono
                  />
               </SettingRow>
               <SettingRow
                  label="Signing secret"
                  description="Payloads are signed with HMAC-SHA256 (X-TaskStudio-Signature). Masked after save."
               >
                  <SecretField
                     value={endpoint.secret}
                     onChange={(secret) => onChange({ ...endpoint, secret })}
                  />
               </SettingRow>
               <SettingRow label="Events" vertical>
                  <div className="grid grid-cols-2 gap-2">
                     {WEBHOOK_EVENTS.map((event) => (
                        <label key={event} className="flex items-center gap-2 text-xs font-mono">
                           <Checkbox
                              checked={endpoint.events.includes(event)}
                              onCheckedChange={(checked) =>
                                 onChange({
                                    ...endpoint,
                                    events: checked
                                       ? [...endpoint.events, event]
                                       : endpoint.events.filter((e) => e !== event),
                                 })
                              }
                           />
                           {event}
                        </label>
                     ))}
                  </div>
               </SettingRow>
            </CollapsibleContent>
         </Collapsible>
      </div>
   );
}

export function WebhooksSection() {
   const form = useSettingsSection('webhooks');
   const { draft, update, replace } = form;

   return (
      <SettingsPage
         title="Webhooks"
         description="Outgoing webhooks for task and runner events. Endpoint configuration and signed test deliveries work today; automatic event delivery ships behind the experimental flag in Settings → Developer."
      >
         <SettingsCard title="Delivery">
            <SwitchRow
               label="Enable outgoing webhooks"
               description="Master switch for future automatic delivery. Test deliveries work regardless."
               checked={draft.enabled}
               onChange={(enabled) => update({ enabled })}
            />
            <SettingRow label="Timeout">
               <NumberField
                  value={draft.timeoutMs}
                  onChange={(v) => v !== null && update({ timeoutMs: v })}
                  min={1000}
                  max={30000}
                  step={500}
                  unit="ms"
               />
            </SettingRow>
            <SettingRow label="Retry policy">
               <PlaceholderBadge />
            </SettingRow>
            <SettingRow label="Delivery history">
               <PlaceholderBadge />
            </SettingRow>
         </SettingsCard>

         <SettingsCard title="Endpoints">
            <div className="px-4 py-3 space-y-3">
               {draft.endpoints.map((endpoint, index) => (
                  <EndpointEditor
                     key={endpoint.id}
                     endpoint={endpoint}
                     isDirtySection={form.isDirty}
                     onChange={(next) => {
                        const endpoints = [...draft.endpoints];
                        endpoints[index] = next;
                        replace({ ...draft, endpoints });
                     }}
                     onRemove={() =>
                        replace({
                           ...draft,
                           endpoints: draft.endpoints.filter((_, i) => i !== index),
                        })
                     }
                  />
               ))}
               {draft.endpoints.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                     No endpoints yet. Add one to receive signed event payloads.
                  </p>
               )}
               <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                     replace({
                        ...draft,
                        endpoints: [
                           ...draft.endpoints,
                           {
                              id: `wh-${Math.random().toString(36).slice(2, 8)}`,
                              name: '',
                              url: '',
                              secret: '',
                              enabled: true,
                              events: [],
                           },
                        ],
                     })
                  }
               >
                  <Plus className="h-3.5 w-3.5" />
                  Add endpoint
               </Button>
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
