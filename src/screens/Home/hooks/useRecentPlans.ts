// src/screens/Home/hooks/useRecentPlans.ts

import { useEffect, useState } from 'react';
import { getChecklistsBySite, getChecklistPileTimings } from '@repositories/checklistRepository';

export interface RecentPlan {
  id: string;
  date: string;
  pileCount: number;
}

const RECENT_PLAN_LIMIT = 3;

/** The site's most recent generated plans, newest first; refetches when `refreshKey` changes. */
export function useRecentPlans(siteId: string | undefined, refreshKey: unknown): RecentPlan[] {
  const [plans, setPlans] = useState<RecentPlan[]>([]);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    (async () => {
      const checklists = await getChecklistsBySite(siteId);
      const latest = [...checklists].sort((a, b) => b.date.localeCompare(a.date)).slice(0, RECENT_PLAN_LIMIT);
      const withCounts = await Promise.all(
        latest.map(async (cl) => ({
          id: cl.id,
          date: cl.date,
          pileCount: (await getChecklistPileTimings(cl.id)).length,
        })),
      );
      if (!cancelled) setPlans(withCounts);
    })().catch((err) => console.error('Failed to load recent plans:', err));
    return () => {
      cancelled = true;
    };
  }, [siteId, refreshKey]);

  return plans;
}
