'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
} from '../settings-ui';

function TestButton({ target, disabled }: { target: 'slack' | 'discord'; disabled: boolean }) {
   const [testing, setTesting] = React.useState(false);
   const runTest = async () => {
      setTesting(true);
      const result = await testWebhook({ target });
      setTesting(false);
      if (result.success && result.data?.ok) {
         toast.success(`Test notification sent (${result.data.status})`);
      } else {
         toast.error(result.data?.error || result.error || 'Test failed');
      }
   };
   return (
      <Button variant="outline" size="sm" onClick={runTest} disabled={disabled || testing}>
         {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
         Send test
      </Button>
   );
}

export function NotificationsSection() {
   const form = useSettingsSection('notifications');
   const { draft, update } = form;

   const requestDesktopPermission = async (enabled: boolean) => {
      if (enabled && typeof Notification !== 'undefined') {
         const permission = await Notification.requestPermission();
         if (permission !== 'granted') {
            toast.warning('Desktop notifications are blocked by the browser');
         }
      }
      update({ desktop: enabled });
   };

   return (
      <SettingsPage
         title="Notifications"
         description="In-app toasts, desktop notifications, and outgoing Slack/Discord messages for runner events."
      >
         <SettingsCard title="In-app">
            <SwitchRow
               label="Enable in-app notifications"
               checked={draft.inApp}
               onChange={(inApp) => update({ inApp })}
            />
            <SwitchRow
               label="Run started"
               checked={draft.onRunStart}
               onChange={(onRunStart) => update({ onRunStart })}
               disabled={!draft.inApp}
            />
            <SwitchRow
               label="Run completed"
               checked={draft.onRunComplete}
               onChange={(onRunComplete) => update({ onRunComplete })}
               disabled={!draft.inApp}
            />
            <SwitchRow
               label="Run failed"
               checked={draft.onRunFail}
               onChange={(onRunFail) => update({ onRunFail })}
               disabled={!draft.inApp}
            />
            <SwitchRow
               label="Run cancelled"
               checked={draft.onRunCancel}
               onChange={(onRunCancel) => update({ onRunCancel })}
               disabled={!draft.inApp}
            />
            <SwitchRow
               label="Task file changed"
               description="Notify when .taskmaster files change on disk."
               checked={draft.onTaskFileChange}
               onChange={(onTaskFileChange) => update({ onTaskFileChange })}
               disabled={!draft.inApp}
            />
            <SwitchRow
               label="Desktop notifications"
               description="Uses the browser Notification API; requires permission."
               checked={draft.desktop}
               onChange={requestDesktopPermission}
            />
            <SettingRow label="Notification history retention">
               <PlaceholderBadge />
            </SettingRow>
         </SettingsCard>

         <SettingsCard
            title="External notifications"
            description="Webhook URLs are sensitive - they are stored in the local settings file, masked after save, and never written to logs."
         >
            <SettingRow
               label="Slack incoming webhook"
               description="Runner events are posted as simple messages."
               vertical
            >
               <div className="flex items-center gap-2">
                  <SecretField
                     value={draft.slackWebhookUrl}
                     onChange={(slackWebhookUrl) => update({ slackWebhookUrl })}
                     placeholder="https://hooks.slack.com/services/…"
                     className="flex-1 w-auto"
                  />
                  <TestButton target="slack" disabled={!draft.slackWebhookUrl || form.isDirty} />
               </div>
               {form.isDirty && draft.slackWebhookUrl && (
                  <p className="text-xs text-muted-foreground mt-1">Save before testing.</p>
               )}
            </SettingRow>
            <SettingRow label="Discord webhook" vertical>
               <div className="flex items-center gap-2">
                  <SecretField
                     value={draft.discordWebhookUrl}
                     onChange={(discordWebhookUrl) => update({ discordWebhookUrl })}
                     placeholder="https://discord.com/api/webhooks/…"
                     className="flex-1 w-auto"
                  />
                  <TestButton
                     target="discord"
                     disabled={!draft.discordWebhookUrl || form.isDirty}
                  />
               </div>
            </SettingRow>
            <p className="px-4 py-2 text-xs text-muted-foreground">
               Sending runner events to Slack/Discord automatically is gated behind the experimental
               webhook delivery flag (Settings → Developer). The test button works today.
            </p>
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
