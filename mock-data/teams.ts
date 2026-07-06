import { Tag } from './tags';
import { User, users } from './users';

export interface Team {
   id: string;
   name: string;
   icon: string;
   joined: boolean;
   color: string;
   members: User[];
   tags: Tag[];
}

// Builds the single workspace team from real Taskmaster tags. There is no
// default/demo team list - callers must pass tags loaded from the tasks file
// (see hooks/use-teams.ts).
export function createTeamsWithTags(tags: Tag[]): Team[] {
   return [
      {
         id: 'TASKMASTER',
         name: 'Taskmaster',
         icon: '📋',
         joined: true,
         color: '#8B5CF6',
         members: users,
         tags,
      },
   ];
}
