import { LexoRank } from '@/lib/utils';
import { LabelInterface } from './labels';
import { Priority } from './priorities';
import { Tag } from './tags';
import { Status } from './status';
import { User } from './users';

export interface Task {
   id: string;
   identifier: string;
   title: string;
   description: string;
   status: Status;
   assignee: User | null;
   priority: Priority;
   labels: LabelInterface[];
   createdAt: string;
   cycleId: string;
   tag?: Tag;
   subtasks?: any[]; // For Taskmaster compatibility
   rank: string;
   dueDate?: string;
}

// generates tasks ranks using LexoRank algorithm.
export const ranks: string[] = [];
const generateTasksRanks = () => {
   const firstRank = new LexoRank('a3c');
   ranks.push(firstRank.toString());
   for (let i = 1; i < 30; i++) {
      const previousRank = LexoRank.from(ranks[i - 1]);
      const currentRank = previousRank.increment();
      ranks.push(currentRank.toString());
   }
};
generateTasksRanks();

// Mock tasks data has been removed - the app loads real Taskmaster data from
// .taskmaster/tasks/tasks.json. Only the Task view-model interface and
// utility functions remain in use.

export function groupTasksByStatus(tasks: Task[]): Record<string, Task[]> {
   return tasks.reduce<Record<string, Task[]>>((acc, task) => {
      const statusId = task.status.id;

      if (!acc[statusId]) {
         acc[statusId] = [];
      }

      acc[statusId].push(task);

      return acc;
   }, {});
}

export function sortTasksByPriority(tasks: Task[]): Task[] {
   const priorityOrder: Record<string, number> = {
      'urgent': 0,
      'high': 1,
      'medium': 2,
      'low': 3,
      'no-priority': 4,
   };

   return tasks
      .slice()
      .sort(
         (a, b) =>
            priorityOrder[a.priority.id as keyof typeof priorityOrder] -
            priorityOrder[b.priority.id as keyof typeof priorityOrder]
      );
}
