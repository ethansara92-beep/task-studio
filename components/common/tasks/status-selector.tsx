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
import { Status } from '@/ui-data/status';
import { CheckIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { TASKMASTER_STATUSES } from '@/lib/taskmaster-constants';
import { useUpdateTask, useCurrentTag } from '@/hooks/use-taskmaster-queries';
import { TaskStatus } from '@/types/taskmaster';
import { extractTaskId } from '@/lib/format-task-id';

interface StatusSelectorProps {
   status: Status;
   taskId: string;
   tagName?: string;
   showLabel?: boolean;
}

export function StatusSelector({
   status,
   taskId,
   tagName,
   showLabel = false,
}: StatusSelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   const [value, setValue] = useState<string>(status.id);

   const { updateTaskStatus, filterByStatus } = useTasksStore();
   const updateTaskMutation = useUpdateTask();
   const { data: currentTagData } = useCurrentTag();
   const currentTag = currentTagData?.currentTag || 'master';

   // Use the provided tagName or fall back to currentTag
   const taskTag = tagName || currentTag;

   useEffect(() => {
      setValue(status.id);
   }, [status.id]);

   const handleStatusChange = async (statusId: string) => {
      setValue(statusId);
      setOpen(false);

      if (taskId) {
         const newStatus = TASKMASTER_STATUSES.find((s) => s.id === statusId);
         if (newStatus) {
            // Update local store immediately for UI feedback
            updateTaskStatus(taskId, newStatus);

            // Extract numeric task ID from the prefixed ID
            const numericTaskId = extractTaskId(taskId);

            // Trigger the API update
            updateTaskMutation.mutate({
               tag: taskTag,
               taskId: numericTaskId,
               updates: {
                  status: statusId as TaskStatus,
               },
            });
         }
      }
   };

   return (
      <div className="*:not-first:mt-2">
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
                  {(() => {
                     const selectedItem = TASKMASTER_STATUSES.find((item) => item.id === value);
                     if (selectedItem) {
                        const Icon = selectedItem.icon;
                        return (
                           <>
                              <div
                                 className={showLabel ? 'h-4 w-4' : ''}
                                 style={{ color: selectedItem.color }}
                              >
                                 <Icon />
                              </div>
                              {showLabel && <span className="text-sm">{selectedItem.name}</span>}
                           </>
                        );
                     }
                     return null;
                  })()}
               </Button>
            </PopoverTrigger>
            <PopoverContent
               className="border-input w-full min-w-[var(--radix-popper-anchor-width)] p-0"
               align="start"
            >
               <Command>
                  <CommandInput placeholder="Set status..." />
                  <CommandList>
                     <CommandEmpty>No status found.</CommandEmpty>
                     <CommandGroup>
                        {TASKMASTER_STATUSES.map((item) => (
                           <CommandItem
                              key={item.id}
                              value={item.id}
                              onSelect={handleStatusChange}
                              className="flex items-center justify-between"
                           >
                              <div className="flex items-center gap-2">
                                 <item.icon />
                                 {item.name}
                              </div>
                              {value === item.id && <CheckIcon size={16} className="ml-auto" />}
                              <span className="text-muted-foreground text-xs">
                                 {filterByStatus(item.id).length}
                              </span>
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
