// src/screens/Home/hooks/useSiteStats.ts

import { useEffect, useState } from 'react';
import { getPileStatusStatsForSite, type PileStatusStats } from '@repositories/pilesRepository';
import { getSiteTargets } from '@repositories/siteRepository';
import { onDeltaSyncComplete } from '@sync/delta/runDeltaSync';

export interface PeriodTarget {
  target: number | null;
  completed: number;
}

export interface SiteTargetStats {
  overall: PileStatusStats;
  weekly: PeriodTarget;
  monthly: PeriodTarget;
}

const EMPTY_STATS: SiteTargetStats = {
  overall: { total: 0, completed: 0, inProgress: 0, notStarted: 0 },
  weekly: { target: null, completed: 0 },
  monthly: { target: null, completed: 0 },
};

export function useSiteStats(siteId: string | undefined, refreshKey: unknown): SiteTargetStats {
  const [stats, setStats] = useState<SiteTargetStats>(EMPTY_STATS);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;

    function load() {
      Promise.all([getPileStatusStatsForSite({ siteId: siteId!, search: '', locationIds: [] }), getSiteTargets(siteId!)])
        .then(([derived, site]) => {
          if (cancelled) return;
          if (!site) {
            setStats({ ...EMPTY_STATS, overall: derived });
            return;
          }
          const total = site.siteConfig.targetPiles ?? derived.total;
          const completed = site.siteConfig.completedPiles;
          setStats({
            overall: {
              total,
              completed,
              inProgress: derived.inProgress,
              notStarted: Math.max(0, total - completed - derived.inProgress),
            },
            weekly: {
              target: site.siteConfig.weeklyTargetPiles,
              completed: site.siteConfig.weeklyCompletedPiles,
            },
            monthly: {
              target: site.siteConfig.monthlyTargetPiles,
              completed: site.siteConfig.monthlyCompletedPiles,
            },
          });
        })
        .catch((err) => console.error('Failed to load site pile stats:', err));
    }

    load();
    const unsubscribe = onDeltaSyncComplete(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [siteId, refreshKey]);

  return stats;
}
