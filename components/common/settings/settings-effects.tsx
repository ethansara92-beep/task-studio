'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { useSettings } from '@/hooks/use-settings';
import { useViewStore } from '@/store/view-store';

const APPLIED_KEY = 'task-studio-settings-applied';

/**
 * Applies persisted preferences (theme, default task view) once per browser
 * session, so ad-hoc changes via the theme toggle or view switcher are not
 * fought on every navigation.
 */
export function SettingsEffects() {
   const { data: settings } = useSettings();
   const { setTheme } = useTheme();
   const setViewType = useViewStore((state) => state.setViewType);

   React.useEffect(() => {
      if (!settings) return;
      try {
         if (sessionStorage.getItem(APPLIED_KEY)) return;
         sessionStorage.setItem(APPLIED_KEY, '1');
      } catch {
         return;
      }
      setTheme(settings.preferences.theme);
      setViewType(settings.preferences.defaultTaskView);
   }, [settings, setTheme, setViewType]);

   return null;
}
