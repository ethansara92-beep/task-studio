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
import { status as allStatus, Status } from '@/ui-data/status';
import { CheckIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

interface StatusSelectorProps {
   status: Status | null | undefined;
   onChange: (status: Status) => void;
}

export function StatusSelector({ status, onChange }: StatusSelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   const [value, setValue] = useState<string>(status?.id || 'to-do');

   const { filterByStatus } = useTasksStore();

   useEffect(() => {
      setValue(status?.id || 'to-do');
   }, [status?.id]);

   // Initialize with default status if none provided
   useEffect(() => {
      if (!status && value === 'to-do') {
         const defaultStatus = allStatus.find((s) => s.id === 'to-do');
         if (defaultStatus) {
            onChange(defaultStatus);
         }
      }
   }, [status, value, onChange]);

   const handleStatusChange = (statusId: string) => {
      setValue(statusId);
      setOpen(false);

      const newStatus = allStatus.find((s) => s.id === statusId);
      if (newStatus) {
         onChange(newStatus);
      }
   };

   return (
      <div className="*:not-first:mt-2">
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <Button
                  id={id}
                  className="flex items-center justify-center"
                  size="xs"
                  variant="secondary"
                  role="combobox"
                  aria-expanded={open}
               >
                  {(() => {
                     const selectedItem =
                        allStatus.find((item) => item.id === value) ||
                        allStatus.find((item) => item.id === 'to-do');
                     if (selectedItem) {
                        const Icon = selectedItem.icon;
                        return (
                           <>
                              <Icon />
                              <span>{selectedItem.name}</span>
                           </>
                        );
                     }
                     return <span>Select status</span>;
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
                        {allStatus.map((item) => (
                           <CommandItem
                              key={item.id}
                              value={item.id}
                              onSelect={() => handleStatusChange(item.id)}
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
