'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useRunnerStatus } from '@/hooks/use-runner';
import { useSettings } from '@/hooks/use-settings';
import { RunRecord } from '@/types/runner';

function notify(message: string, desktop: boolean, kind: 'success' | 'error' | 'info') {
   if (kind === 'success') toast.success(message);
   else if (kind === 'error') toast.error(message);
   else toast.info(message);

   if (desktop && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
         new Notification('Task Studio', { body: message });
      } catch {
         // Desktop notifications are best-effort.
      }
   }
}

/**
 * Invisible watcher that turns runner status transitions into in-app toasts
 * and (optionally) desktop notifications, per Settings → Notifications.
 * Uses the shared runner status query - no extra polling.
 */
export function RunnerNotifications() {
   const { data: status } = useRunnerStatus();
   const { data: settings } = useSettings();
   const previousRuns = React.useRef<Map<string, RunRecord['status']>>(new Map());
   const initialized = React.useRef(false);

   React.useEffect(() => {
      if (!status) return;
      const prefs = settings?.notifications;

      const current = new Map<string, RunRecord['status']>();
      const allRuns = [...(status.activeRun ? [status.activeRun] : []), ...status.recentRuns];
      for (const run of allRuns) {
         if (!current.has(run.runId)) current.set(run.runId, run.status);
      }

      // Skip notifications for state that existed before this page loaded.
      if (!initialized.current) {
         initialized.current = true;
         previousRuns.current = current;
         return;
      }

      if (prefs?.inApp) {
         const desktop = prefs.desktop;
         for (const [runId, runStatus] of current) {
            const previous = previousRuns.current.get(runId);
            if (previous === runStatus) continue;

            const run = allRuns.find((r) => r.runId === runId);
            const label = run?.taskId ? `task ${run.taskId}` : (run?.mode ?? 'run');

            if (runStatus === 'running' && previous === undefined && prefs.onRunStart) {
               notify(`Run started (${label})`, desktop, 'info');
            } else if (runStatus === 'completed' && prefs.onRunComplete) {
               notify(`Run completed (${label})`, desktop, 'success');
            } else if (runStatus === 'failed' && prefs.onRunFail) {
               notify(`Run failed (${label})`, desktop, 'error');
            } else if (runStatus === 'cancelled' && prefs.onRunCancel) {
               notify(`Run cancelled (${label})`, desktop, 'info');
            }
         }
      }

      previousRuns.current = current;
   }, [status, settings]);

   return null;
}
