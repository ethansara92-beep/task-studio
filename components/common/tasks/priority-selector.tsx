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
import { priorities, Priority } from '@/ui-data/priorities';
import { CheckIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useUpdateTask, useCurrentTag } from '@/hooks/use-taskmaster-queries';
import { TaskPriority } from '@/types/taskmaster';
import { extractTaskId } from '@/lib/format-task-id';

interface PrioritySelectorProps {
   priority: Priority;
   taskId?: string;
   tagName?: string;
   showLabel?: boolean;
}

export function PrioritySelector({
   priority,
   taskId,
   tagName,
   showLabel = false,
}: PrioritySelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   const [value, setValue] = useState<string>(priority.id);

   const { filterByPriority, updateTaskPriority } = useTasksStore();
   const updateTaskMutation = useUpdateTask();
   const { data: currentTagData } = useCurrentTag();
   const currentTag = currentTagData?.currentTag || 'master';

   // Use the provided tagName or fall back to currentTag
   const taskTag = tagName || currentTag;

   useEffect(() => {
      setValue(priority.id);
   }, [priority.id]);

   const handlePriorityChange = async (priorityId: string) => {
      setValue(priorityId);
      setOpen(false);

      if (taskId) {
         const newPriority = priorities.find((p) => p.id === priorityId);
         if (newPriority) {
            // Update local store immediately for UI feedback
            updateTaskPriority(taskId, newPriority);

            // Extract numeric task ID from the prefixed ID
            const numericTaskId = extractTaskId(taskId);

            // Trigger the API update
            updateTaskMutation.mutate({
               tag: taskTag,
               taskId: numericTaskId,
               updates: {
                  priority: priorityId as TaskPriority,
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
                     const selectedItem = priorities.find((item) => item.id === value);
                     if (selectedItem) {
                        const Icon = selectedItem.icon;
                        return (
                           <>
                              <Icon
                                 className={showLabel ? 'h-4 w-4' : 'text-muted-foreground size-4'}
                              />
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
                  <CommandInput placeholder="Set priority..." />
                  <CommandList>
                     <CommandEmpty>No priority found.</CommandEmpty>
                     <CommandGroup>
                        {priorities.map((item) => (
                           <CommandItem
                              key={item.id}
                              value={item.id}
                              onSelect={handlePriorityChange}
                              className="flex items-center justify-between"
                           >
                              <div className="flex items-center gap-2">
                                 <item.icon className="text-muted-foreground size-4" />
                                 {item.name}
                              </div>
                              {value === item.id && <CheckIcon size={16} className="ml-auto" />}
                              <span className="text-muted-foreground text-xs">
                                 {filterByPriority(item.id).length}
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
