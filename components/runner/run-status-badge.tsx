'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { RunStatus } from '@/types/runner';

const STATUS_STYLES: Record<RunStatus | 'idle', { label: string; className: string }> = {
   idle: { label: 'Idle', className: 'bg-muted text-muted-foreground' },
   queued: { label: 'Queued', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
   running: { label: 'Running', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
   completed: {
      label: 'Completed',
      className: 'bg-green-500/15 text-green-600 dark:text-green-400',
   },
   failed: { label: 'Failed', className: 'bg-red-500/15 text-red-600 dark:text-red-400' },
   cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
};

export function RunStatusBadge({ status }: { status: RunStatus | 'idle' }) {
   const style = STATUS_STYLES[status] ?? STATUS_STYLES.idle;

   return (
      <Badge variant="secondary" className={cn('gap-1.5 font-medium', style.className)}>
         {status === 'running' && (
            <span className="relative flex h-2 w-2">
               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75" />
               <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
         )}
         {style.label}
      </Badge>
   );
}
