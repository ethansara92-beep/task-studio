import { Status, status } from './status';
import { User, users } from './users';
import { Priority, priorities } from './priorities';

export interface Tag {
   id: string;
   name: string;
   status: Status;
   percentComplete: number;
   startDate: string;
   lead: User;
   priority: Priority;
   health: Health;
   taskCount?: number;
   statusCounts?: {
      pending: number;
      in_progress: number;
      done: number;
      cancelled: number;
   };
   totalTasks?: number;
}

interface Health {
   id: 'no-update' | 'off-track' | 'on-track' | 'at-risk';
   name: string;
   color: string;
   description: string;
}

export const health: Health[] = [
   {
      id: 'no-update',
      name: 'No Update',
      color: '#FF0000',
      description: 'The project has not been updated in the last 30 days.',
   },
   {
      id: 'off-track',
      name: 'Off Track',
      color: '#FF0000',
      description: 'The project is not on track and may be delayed.',
   },
   {
      id: 'on-track',
      name: 'On Track',
      color: '#00FF00',
      description: 'The project is on track and on schedule.',
   },
   {
      id: 'at-risk',
      name: 'At Risk',
      color: '#FF0000',
      description: 'The project is at risk and may be delayed.',
   },
];

// Builds a Tag view-model from real Taskmaster tag data. Progress and health
// are derived from actual status counts when provided - never invented.
export function createTagFromData(
   tagName: string,
   taskCount: number,
   metadata?: any,
   index: number = 0,
   statusCounts?: { pending: number; in_progress: number; done: number; cancelled: number }
): Tag {
   const totalTasks = statusCounts
      ? statusCounts.pending + statusCounts.in_progress + statusCounts.done + statusCounts.cancelled
      : taskCount;
   const percentComplete =
      statusCounts && totalTasks > 0 ? Math.round((statusCounts.done / totalTasks) * 100) : 0;

   // Map completion to a status bucket (unknown → first/backlog status).
   const tagStatus = statusCounts
      ? percentComplete === 100
         ? status[5]
         : percentComplete > 80
           ? status[4]
           : percentComplete > 60
             ? status[3]
             : percentComplete > 40
               ? status[2]
               : percentComplete > 20
                 ? status[1]
                 : status[0]
      : status[0];

   const tagHealth = statusCounts
      ? percentComplete > 70
         ? health[2] // on-track
         : percentComplete > 40
           ? health[3] // at-risk
           : percentComplete > 20
             ? health[1] // off-track
             : health[0] // no-update
      : health[0];

   return {
      id: tagName,
      name:
         tagName === 'master'
            ? 'Master'
            : tagName
                 .split('-')
                 .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                 .join(' '),
      status: tagStatus,
      percentComplete,
      startDate: metadata?.created || new Date().toISOString().split('T')[0],
      lead: users[0], // Default to first user
      priority: priorities[index % priorities.length],
      health: tagHealth,
      taskCount,
      statusCounts,
      totalTasks,
   };
}

// Export a function that can be used to get tags from actual tag data
export function getTagsFromData(
   tagsData: Array<{ name: string; taskCount: number; metadata?: any }>
): Tag[] {
   return tagsData.map((tag, index) =>
      createTagFromData(tag.name, tag.taskCount, tag.metadata, index)
   );
}
