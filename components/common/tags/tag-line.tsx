import { Tag } from '@/lib/tags';
import { HealthPopover } from './health-popover';
import { PrioritySelector } from './priority-selector';
import { LeadSelector } from './lead-selector';
import { StatusWithPercent } from './status-with-percent';
import { DatePicker } from './date-picker';
import Link from 'next/link';
import { GitBranch } from 'lucide-react';

interface TagWithStatus extends Tag {
   statusCounts: {
      pending: number;
      in_progress: number;
      done: number;
      cancelled: number;
   };
   totalTasks: number;
}

interface TagLineProps {
   tag: TagWithStatus;
}

export default function TagLine({ tag }: TagLineProps) {
   // Calculate percentage complete based on real task status
   const percentComplete =
      tag.totalTasks > 0 ? Math.round((tag.statusCounts.done / tag.totalTasks) * 100) : 0;

   // Determine tag status based on task statuses
   const getTagStatus = () => {
      if (tag.totalTasks === 0) return tag.status;
      if (tag.statusCounts.done === tag.totalTasks)
         return { id: 'completed', name: 'Completed', color: '#8b5cf6', icon: tag.status.icon };
      if (tag.statusCounts.in_progress > 0)
         return {
            id: 'in-progress',
            name: 'In Progress',
            color: '#facc15',
            icon: tag.status.icon,
         };
      if (tag.statusCounts.cancelled === tag.totalTasks)
         return { id: 'paused', name: 'Paused', color: '#0ea5e9', icon: tag.status.icon };
      return { id: 'to-do', name: 'Todo', color: '#f97316', icon: tag.status.icon };
   };

   return (
      <Link
         href={`/tag/${encodeURIComponent(tag.id)}`}
         className="w-full flex items-center py-3 px-6 border-b hover:bg-sidebar/50 border-muted-foreground/5 text-sm cursor-pointer transition-colors"
      >
         <div className="w-[60%] sm:w-[70%] xl:w-[46%] flex items-center gap-2">
            <div className="relative">
               <div className="inline-flex size-6 bg-muted/50 items-center justify-center rounded shrink-0">
                  <GitBranch className="size-4" />
               </div>
            </div>
            <div className="flex flex-col items-start overflow-hidden">
               <span className="font-medium truncate w-full">{tag.name}</span>
               <span className="text-xs text-muted-foreground">
                  {tag.totalTasks} {tag.totalTasks === 1 ? 'task' : 'tasks'}
               </span>
            </div>
         </div>

         <div className="w-[20%] sm:w-[10%] xl:w-[13%]" onClick={(e) => e.preventDefault()}>
            <HealthPopover tag={tag} />
         </div>

         <div className="hidden w-[10%] sm:block" onClick={(e) => e.preventDefault()}>
            <PrioritySelector priority={tag.priority} />
         </div>
         <div className="hidden xl:block xl:w-[13%]" onClick={(e) => e.preventDefault()}>
            <LeadSelector lead={tag.lead} />
         </div>

         <div className="hidden xl:block xl:w-[13%]" onClick={(e) => e.preventDefault()}>
            <DatePicker date={tag.startDate ? new Date(tag.startDate) : undefined} />
         </div>

         <div className="w-[20%] sm:w-[10%]" onClick={(e) => e.preventDefault()}>
            <StatusWithPercent status={getTagStatus()} percentComplete={percentComplete} />
         </div>
      </Link>
   );
}
