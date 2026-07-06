'use client';

import { Team, createTeamsWithTags } from '@/ui-data/teams';
import { useTagsFromData } from './use-tags-from-data';

/**
 * The workspace team list, built from real Taskmaster tags (loaded from
 * tasks.json). Returns an empty list while loading or on error - never demo
 * data.
 */
export function useTeams(): { teams: Team[]; isLoading: boolean; error: Error | null } {
   const { tags, isLoading, error } = useTagsFromData();
   return {
      teams: isLoading || error ? [] : createTeamsWithTags(tags),
      isLoading,
      error,
   };
}
