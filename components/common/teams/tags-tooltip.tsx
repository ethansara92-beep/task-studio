'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tag } from '@/lib/tags';
import { Box, GitBranch } from 'lucide-react';

interface TagsTooltipProps {
   tags: Tag[];
}

export function TagsTooltip({ tags }: TagsTooltipProps) {
   return (
      <TooltipProvider>
         <Tooltip>
            <TooltipTrigger asChild>
               <div className="flex items-center gap-2 cursor-pointer">
                  <Box className="size-4" />
                  <span>{tags.length}</span>
               </div>
            </TooltipTrigger>
            <TooltipContent className="p-2">
               <div className="flex flex-col gap-1">
                  {tags.map((tag, index) => (
                     <div key={index} className="flex items-center gap-1.5">
                        <GitBranch className="size-4 shrink-0" />
                        <span className="text-sm w-full text-left">{tag?.name}</span>
                        <div className="shrink-0">
                           <tag.status.icon />
                        </div>
                     </div>
                  ))}
               </div>
            </TooltipContent>
         </Tooltip>
      </TooltipProvider>
   );
}
