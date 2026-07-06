import { useTags } from './use-taskmaster-queries';
import { getTagsFromData, Tag } from '@/lib/tags';

export function useTagsFromData(): {
   tags: Tag[];
   isLoading: boolean;
   error: Error | null;
} {
   const { data: tagsData, isLoading, error } = useTags();

   // Convert tags data to tag objects
   const tags = tagsData ? getTagsFromData(tagsData) : [];

   return {
      tags,
      isLoading,
      error: error as Error | null,
   };
}
