import { Status, ToDoIcon, InProgressIcon, CompletedIcon, PausedIcon } from '@/lib/status';

// Taskmaster status definitions
export const TASKMASTER_STATUSES: Status[] = [
   { id: 'pending', name: 'Todo', color: '#6B7280', icon: ToDoIcon },
   { id: 'in_progress', name: 'In Progress', color: '#3B82F6', icon: InProgressIcon },
   { id: 'done', name: 'Done', color: '#10B981', icon: CompletedIcon },
   { id: 'cancelled', name: 'Cancelled', color: '#EF4444', icon: PausedIcon },
];

// Status mapping for converting Taskmaster status to UI status
export const TASKMASTER_STATUS_MAP = {
   'pending': { name: 'Todo', color: '#6B7280', icon: ToDoIcon },
   'in_progress': { name: 'In Progress', color: '#3B82F6', icon: InProgressIcon },
   'in-progress': { name: 'In Progress', color: '#3B82F6', icon: InProgressIcon }, // Also handle hyphenated version
   'done': { name: 'Done', color: '#10B981', icon: CompletedIcon },
   'cancelled': { name: 'Cancelled', color: '#EF4444', icon: PausedIcon },
};

// Project status definitions (similar to task statuses but for projects)
export const PROJECT_STATUSES: Status[] = [
   { id: 'to-do', name: 'Todo', color: '#f97316', icon: ToDoIcon },
   { id: 'in-progress', name: 'In Progress', color: '#facc15', icon: InProgressIcon },
   { id: 'completed', name: 'Completed', color: '#8b5cf6', icon: CompletedIcon },
   { id: 'paused', name: 'Paused', color: '#0ea5e9', icon: PausedIcon },
];
