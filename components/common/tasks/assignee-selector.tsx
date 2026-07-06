'use client';

import { Button } from '@/components/ui/button';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTasksStore } from '@/store/tasks-store';
import { User, users } from '@/ui-data/users';
import { CheckIcon, UserPlus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useEffect, useId, useState } from 'react';
import { useUpdateTask, useCurrentTag } from '@/hooks/use-taskmaster-queries';
import { extractTaskId } from '@/lib/format-task-id';

interface AssigneeSelectorProps {
   user: User | null;
   taskId: string;
   tagName?: string;
   showLabel?: boolean;
}

export function AssigneeSelector({
   user,
   taskId,
   tagName,
   showLabel = true,
}: AssigneeSelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   const [value, setValue] = useState<string | null>(user?.id || null);

   const { updateTaskAssignee } = useTasksStore();
   const updateTaskMutation = useUpdateTask();
   const { data: currentTagData } = useCurrentTag();
   const currentTag = currentTagData?.currentTag || 'master';

   // Use the provided tagName or fall back to currentTag
   const taskTag = tagName || currentTag;

   useEffect(() => {
      setValue(user?.id || null);
   }, [user?.id]);

   const handleAssigneeChange = async (userId: string) => {
      setValue(userId);
      setOpen(false);

      if (taskId) {
         const newUser = users.find((u) => u.id === userId);
         if (newUser) {
            // Update local store immediately for UI feedback
            updateTaskAssignee(taskId, newUser);

            // Extract numeric task ID from the prefixed ID
            const numericTaskId = extractTaskId(taskId);

            // Trigger the API update
            updateTaskMutation.mutate({
               tag: taskTag,
               taskId: numericTaskId,
               updates: {
                  assignee: newUser.name, // Using name as assignee identifier
               },
            });
         }
      }
   };

   const selectedUser = value ? users.find((u) => u.id === value) : null;

   return (
      <div>
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <Button
                  id={id}
                  className={
                     showLabel
                        ? 'w-full justify-start gap-2 h-8 px-2 font-normal'
                        : 'size-7 flex items-center justify-center'
                  }
                  size={showLabel ? 'sm' : 'icon'}
                  variant="ghost"
                  role="combobox"
                  aria-expanded={open}
               >
                  {selectedUser ? (
                     <>
                        <Avatar className={showLabel ? 'size-5' : 'size-4'}>
                           <AvatarImage src={selectedUser.avatarUrl} alt={selectedUser.name} />
                           <AvatarFallback>{selectedUser.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        {showLabel && <span className="text-sm">{selectedUser.name}</span>}
                     </>
                  ) : (
                     <>
                        <UserPlus className="h-4 w-4" />
                        {showLabel && <span className="text-sm">Assign</span>}
                     </>
                  )}
               </Button>
            </PopoverTrigger>
            <PopoverContent className="border-input w-48 p-0" align="start">
               <Command>
                  <CommandInput placeholder="Assign to..." />
                  <CommandList>
                     <CommandEmpty>No user found.</CommandEmpty>
                     <CommandGroup>
                        {users.map((user) => (
                           <CommandItem
                              key={user.id}
                              value={user.id}
                              onSelect={handleAssigneeChange}
                              className="flex items-center justify-between"
                           >
                              <div className="flex items-center gap-2">
                                 <Avatar className="size-5">
                                    <AvatarImage src={user.avatarUrl} alt={user.name} />
                                    <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                                 </Avatar>
                                 <span className="text-xs">{user.name}</span>
                              </div>
                              {value === user.id && <CheckIcon size={14} className="ml-auto" />}
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  </CommandList>
               </Command>
            </PopoverContent>
         </Popover>
      </div>
   );
}
