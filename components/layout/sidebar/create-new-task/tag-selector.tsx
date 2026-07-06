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
import { Tag } from '@/ui-data/tags';
import { CheckIcon, GitBranch } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTags } from '@/hooks/use-taskmaster-queries';
import { createTagFromData } from '@/ui-data/tags';

interface TagSelectorProps {
   tag: Tag | undefined;
   onChange: (tag: Tag | undefined) => void;
}

export function TagSelector({ tag, onChange }: TagSelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   const [value, setValue] = useState<string | undefined>(tag?.name);
   const { data: tagsData } = useTags();

   useEffect(() => {
      setValue(tag?.name);
   }, [tag]);

   const handleTagChange = (tagName: string) => {
      setValue(tagName);
      const tagData = tagsData?.find((t) => t.name === tagName);
      if (tagData) {
         const newTag = createTagFromData(tagData.name, tagData.taskCount, tagData.metadata, 0);
         onChange(newTag);
      }
      setOpen(false);
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
                  <GitBranch className="size-4" />
                  <span>{value === 'master' ? 'master' : value}</span>
               </Button>
            </PopoverTrigger>
            <PopoverContent
               className="border-input w-full min-w-[var(--radix-popper-anchor-width)] p-0"
               align="start"
            >
               <Command>
                  <CommandInput placeholder="Set tag..." />
                  <CommandList>
                     <CommandEmpty>No tags found.</CommandEmpty>
                     <CommandGroup>
                        {tagsData?.map((tag) => (
                           <CommandItem
                              key={tag.name}
                              value={tag.name}
                              onSelect={() => handleTagChange(tag.name)}
                              className="flex items-center justify-between"
                           >
                              <div className="flex items-center gap-2">
                                 <GitBranch className="size-4" />
                                 {tag.name === 'master' ? 'master' : tag.name}
                              </div>
                              {value === tag.name && <CheckIcon size={16} className="ml-auto" />}
                              <span className="text-muted-foreground text-xs">{tag.taskCount}</span>
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
