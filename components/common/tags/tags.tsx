'use client';

import TagLine from '@/components/common/tags/tag-line';
import { useTags } from '@/hooks/use-taskmaster-queries';
import { useAllTasks } from '@/hooks/use-all-tasks';
import { createTagFromData } from '@/lib/tags';
import { useMemo } from 'react';
import { TaskmasterTask } from '@/types/taskmaster';

interface TaskWithTag extends TaskmasterTask {
   tagName: string;
}

export default function Tags() {
   const { data: tagsData, isLoading: tagsLoading } = useTags();
   const { data: allTasksData, isLoading: tasksLoading } = useAllTasks();

   const tags = useMemo(() => {
      if (!tagsData || !allTasksData) return [];

      return tagsData.map((tag, index) => {
         // Get tasks for this tag
         const tagTasks = (allTasksData.allTasks as TaskWithTag[]).filter(
            (task) => task.tagName === tag.name
         );

         // Calculate status counts
         const statusCounts = {
            pending: tagTasks.filter((t) => t.status === 'pending').length,
            in_progress: tagTasks.filter(
               (t) => t.status === 'in_progress' || t.status === 'in-progress'
            ).length,
            done: tagTasks.filter((t) => t.status === 'done').length,
            cancelled: tagTasks.filter((t) => t.status === 'cancelled').length,
         };

         // Create tag with real status derived from actual task counts
         const tagData = createTagFromData(tag.name, tag.taskCount, tag.metadata, index, statusCounts);

         // Calculate health based on task progress
         const getTagHealth = () => {
            if (tagTasks.length === 0) {
               return {
                  id: 'no-update' as const,
                  name: 'No Update',
                  color: '#94A3B8',
                  description: 'No tasks in this tag yet',
               };
            }

            const completionRate = statusCounts.done / tagTasks.length;
            const inProgressRate = statusCounts.in_progress / tagTasks.length;

            // If more than 80% done, it's on track
            if (completionRate >= 0.8) {
               return {
                  id: 'on-track' as const,
                  name: 'On Track',
                  color: '#10B981',
                  description: `${Math.round(completionRate * 100)}% of tasks completed`,
               };
            }

            // If good progress is being made, it's on track
            if (inProgressRate >= 0.3 || completionRate >= 0.5) {
               return {
                  id: 'on-track' as const,
                  name: 'On Track',
                  color: '#10B981',
                  description: `Good progress with ${statusCounts.in_progress} tasks in progress`,
               };
            }

            // If some progress but slow, it's at risk
            if (completionRate >= 0.2 || inProgressRate >= 0.1) {
               return {
                  id: 'at-risk' as const,
                  name: 'At Risk',
                  color: '#F59E0B',
                  description: `Limited progress - ${Math.round(completionRate * 100)}% complete`,
               };
            }

            // Otherwise it's off track
            return {
               id: 'off-track' as const,
               name: 'Off Track',
               color: '#EF4444',
               description: `Minimal progress - only ${Math.round(completionRate * 100)}% complete`,
            };
         };

         // Add real status information
         return {
            ...tagData,
            health: getTagHealth(),
            statusCounts,
            totalTasks: tagTasks.length,
         };
      });
   }, [tagsData, allTasksData]);

   if (tagsLoading || tasksLoading) {
      return <div className="w-full h-full flex items-center justify-center">Loading tags...</div>;
   }
   return (
      <div className="w-full">
         <div className="bg-container px-6 py-1.5 text-sm flex items-center text-muted-foreground border-b sticky top-0 z-10">
            <div className="w-[60%] sm:w-[70%] xl:w-[46%]">Name</div>
            <div className="w-[20%] sm:w-[10%] xl:w-[13%] pl-2.5">Health</div>
            <div className="hidden w-[10%] sm:block pl-2">Priority</div>
            <div className="hidden xl:block xl:w-[13%] pl-2">Lead</div>
            <div className="hidden xl:block xl:w-[13%] pl-2.5">Target date</div>
            <div className="w-[20%] sm:w-[10%] pl-2">Status</div>
         </div>

         <div className="w-full">
            {tags.map((tag) => (
               <TagLine key={tag.id} tag={tag} />
            ))}
         </div>
      </div>
   );
}
