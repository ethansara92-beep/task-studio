import { Badge } from '@/components/ui/badge';
import { Tag } from '@/lib/tags';
import Link from 'next/link';
import { GitBranch } from 'lucide-react';

export function TagBadge({ tag }: { tag: Tag }) {
   // Tag ID is the tag name
   const tagName = tag.id;

   return (
      <Link href={`/tag/${tagName}`} className="flex items-center justify-center gap-.5">
         <Badge
            variant="outline"
            className="gap-1.5 rounded-full text-muted-foreground bg-background"
         >
            <GitBranch size={16} />
            {tag.name}
         </Badge>
      </Link>
   );
}
