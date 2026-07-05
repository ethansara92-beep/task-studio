'use client';

import * as React from 'react';
import { Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { SECRET_MASK, TaskStudioSettings } from '@/types/settings';
import { settingsKeys, useMaintenance, useResetSettings, useSettings } from '@/hooks/use-settings';
import {
   ConfirmActionButton,
   PlaceholderBadge,
   SettingRow,
   SettingsCard,
   SettingsPage,
} from '../settings-ui';

/** Removes masked secret sentinels so exports never contain secret markers. */
function stripMaskedSecrets(settings: TaskStudioSettings): TaskStudioSettings {
   const json = JSON.stringify(settings).split(SECRET_MASK).join('');
   return JSON.parse(json);
}

export function ImportExportSection() {
   const { data: settings } = useSettings();
   const reset = useResetSettings();
   const maintenance = useMaintenance();
   const queryClient = useQueryClient();
   const fileRef = React.useRef<HTMLInputElement>(null);
   const [importing, setImporting] = React.useState(false);

   const exportSettings = () => {
      if (!settings) return;
      const clean = stripMaskedSecrets(settings);
      const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `task-studio-settings-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Settings exported (secrets excluded)');
   };

   const importSettings = async (file: File) => {
      setImporting(true);
      try {
         const text = await file.text();
         // Parse locally first for a fast, clear error on invalid JSON.
         JSON.parse(text);
         const response = await fetch('/api/settings/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: text,
         });
         const result = await response.json();
         if (result.success) {
            queryClient.setQueryData(settingsKeys.settings(), result.data.settings);
            toast.success(
               result.data.backupPath
                  ? 'Settings imported - previous settings backed up'
                  : 'Settings imported'
            );
         } else {
            toast.error(result.error || 'Import failed');
         }
      } catch {
         toast.error('That file is not valid JSON - current settings are unchanged');
      } finally {
         setImporting(false);
         if (fileRef.current) fileRef.current.value = '';
      }
   };

   return (
      <SettingsPage
         title="Import / Export"
         description="Move settings between machines or back them up. Exports never include secrets; imports are validated before anything is written and the current file is backed up first."
      >
         <SettingsCard title="Settings">
            <SettingRow
               label="Export settings"
               description="Downloads the full settings document as JSON, with all secrets removed."
            >
               <Button variant="outline" size="sm" onClick={exportSettings} disabled={!settings}>
                  <Download className="h-3.5 w-3.5" />
                  Export JSON
               </Button>
            </SettingRow>
            <SettingRow
               label="Import settings"
               description="Validated against the settings schema; invalid files are rejected without touching the current config."
            >
               <input
                  ref={fileRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => {
                     const file = e.target.files?.[0];
                     if (file) importSettings(file);
                  }}
               />
               <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={importing}
               >
                  <Upload className="h-3.5 w-3.5" />
                  {importing ? 'Importing…' : 'Import JSON'}
               </Button>
            </SettingRow>
            <SettingRow
               label="Reset settings to defaults"
               description="A backup of the current file is written first."
            >
               <ConfirmActionButton
                  label="Reset to defaults"
                  title="Reset all settings?"
                  description="Every section returns to its default values and secrets are removed. A backup is written next to the settings file."
                  confirmLabel="Reset everything"
                  onConfirm={() => reset.mutate()}
                  disabled={reset.isPending}
               />
            </SettingRow>
         </SettingsCard>

         <SettingsCard title="Task data">
            <SettingRow
               label="Export task data"
               description="Tasks live in .taskmaster/tasks/tasks.json, which Taskmaster owns - copy that file directly. In-app task export is planned."
            >
               <PlaceholderBadge />
            </SettingRow>
            <SettingRow
               label="Import task data"
               description="Not offered: importing tasks could corrupt Taskmaster's files. Use Taskmaster's own commands."
            >
               <PlaceholderBadge label="Use Taskmaster CLI" />
            </SettingRow>
         </SettingsCard>

         <SettingsCard title="Runner data">
            <SettingRow label="Clear run logs & history">
               <ConfirmActionButton
                  label="Clear runs"
                  title="Clear run history?"
                  description="All finished run records and log files are deleted."
                  confirmLabel="Delete"
                  onConfirm={() => maintenance.mutate('clear-run-history')}
                  disabled={maintenance.isPending}
               />
            </SettingRow>
            <SettingRow label="Clear stale runner lock">
               <ConfirmActionButton
                  label="Clear stale lock"
                  title="Clear stale lock?"
                  description="Only proceeds if the lock's process is no longer alive."
                  confirmLabel="Clear"
                  variant="outline"
                  onConfirm={() => maintenance.mutate('clear-stale-lock')}
                  disabled={maintenance.isPending}
               />
            </SettingRow>
         </SettingsCard>
      </SettingsPage>
   );
}
