'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
   fetchDiagnostics,
   fetchSettings,
   resetSettings,
   runMaintenance,
   saveSettings,
} from '@/lib/api/settings';
import { SettingsSectionKey, TaskStudioSettings, createDefaultSettings } from '@/types/settings';

export const settingsKeys = {
   all: ['settings'] as const,
   settings: () => [...settingsKeys.all, 'data'] as const,
   diagnostics: () => [...settingsKeys.all, 'diagnostics'] as const,
};

/** Shared settings query. Secrets are already masked server-side. */
export function useSettings() {
   return useQuery({
      queryKey: settingsKeys.settings(),
      queryFn: async (): Promise<TaskStudioSettings> => {
         const result = await fetchSettings();
         if (!result.success || !result.data) {
            throw new Error(result.error || 'Failed to load settings');
         }
         return result.data;
      },
      staleTime: 30000,
   });
}

export function useSaveSettings() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: async (settings: TaskStudioSettings) => {
         const result = await saveSettings(settings);
         if (!result.success || !result.data) {
            throw new Error(result.error || 'Failed to save settings');
         }
         return result.data;
      },
      onSuccess: (data) => {
         queryClient.setQueryData(settingsKeys.settings(), data);
         toast.success('Settings saved');
      },
      onError: (error: Error) => toast.error(error.message),
   });
}

export function useResetSettings() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: async () => {
         const result = await resetSettings();
         if (!result.success || !result.data) {
            throw new Error(result.error || 'Failed to reset settings');
         }
         return result.data;
      },
      onSuccess: (data) => {
         queryClient.setQueryData(settingsKeys.settings(), data);
         toast.success('Settings reset to defaults');
      },
      onError: (error: Error) => toast.error(error.message),
   });
}

export function useDiagnostics() {
   return useQuery({
      queryKey: settingsKeys.diagnostics(),
      queryFn: async () => {
         const result = await fetchDiagnostics();
         if (!result.success || !result.data) {
            throw new Error(result.error || 'Failed to load diagnostics');
         }
         return result.data;
      },
      staleTime: 60000,
   });
}

export function useMaintenance() {
   const queryClient = useQueryClient();
   return useMutation({
      mutationFn: async (action: Parameters<typeof runMaintenance>[0]) => {
         const result = await runMaintenance(action);
         if (!result.success || !result.data) {
            throw new Error(result.error || 'Maintenance action failed');
         }
         return result.data;
      },
      onSuccess: (data) => {
         toast.success(data.detail);
         queryClient.invalidateQueries({ queryKey: ['runner'] });
         queryClient.invalidateQueries({ queryKey: settingsKeys.diagnostics() });
      },
      onError: (error: Error) => toast.error(error.message),
   });
}

export interface SettingsSectionForm<K extends SettingsSectionKey> {
   /** Editable draft of the section (kept in sync until the user edits). */
   draft: TaskStudioSettings[K];
   /** Applies a partial patch to the draft. */
   update: (patch: Partial<TaskStudioSettings[K]>) => void;
   /** Replaces the draft entirely (for array-heavy sections). */
   replace: (next: TaskStudioSettings[K]) => void;
   isDirty: boolean;
   isLoading: boolean;
   isSaving: boolean;
   save: () => void;
   /** Discards local edits back to the saved values. */
   discard: () => void;
   /** Clears the dirty flag (after an external combined save). */
   markClean: () => void;
   /** The full saved settings document (read-only). */
   settings: TaskStudioSettings | undefined;
}

/**
 * Draft-state form controller for one settings section: tracks edits
 * locally, knows when it is dirty, and saves by merging the section back
 * into the full settings document.
 */
export function useSettingsSection<K extends SettingsSectionKey>(
   section: K
): SettingsSectionForm<K> {
   const { data: settings, isLoading } = useSettings();
   const saveMutation = useSaveSettings();

   const defaults = React.useMemo(() => createDefaultSettings(), []);
   const saved = settings?.[section] ?? defaults[section];

   const [draft, setDraft] = React.useState<TaskStudioSettings[K]>(saved);
   const [dirty, setDirty] = React.useState(false);

   // Follow server updates while the user has no local edits.
   const savedJson = JSON.stringify(saved);
   React.useEffect(() => {
      if (!dirty) setDraft(JSON.parse(savedJson));
   }, [savedJson, dirty]);

   const update = React.useCallback((patch: Partial<TaskStudioSettings[K]>) => {
      setDraft((prev) => ({ ...prev, ...patch }));
      setDirty(true);
   }, []);

   const replace = React.useCallback((next: TaskStudioSettings[K]) => {
      setDraft(next);
      setDirty(true);
   }, []);

   const save = React.useCallback(() => {
      if (!settings) return;
      saveMutation.mutate({ ...settings, [section]: draft }, { onSuccess: () => setDirty(false) });
   }, [settings, section, draft, saveMutation]);

   const discard = React.useCallback(() => {
      setDraft(JSON.parse(savedJson));
      setDirty(false);
   }, [savedJson]);

   const markClean = React.useCallback(() => setDirty(false), []);

   return {
      draft,
      update,
      replace,
      isDirty: dirty,
      isLoading,
      isSaving: saveMutation.isPending,
      save,
      discard,
      markClean,
      settings,
   };
}
