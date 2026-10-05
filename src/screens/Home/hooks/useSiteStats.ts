// src/screens/Home/hooks/useSiteStats.ts

import { useEffect, useState } from 'react';
import { getPileStatusStatsForSite, type PileStatusStats } from '@repositories/pilesRepository';
import { getSiteTargets } from '@repositories/siteRepository';
import { getTargetPeriodByDate } from '@repositories/targetPeriodRepository';
import { onDeltaSyncComplete } from '@sync/delta/runDeltaSync';

export interface PeriodTarget {
  target: number | null;
  completed: number;
}

export interface SiteTargetStats {
  overall: PileStatusStats;
  weekly: PeriodTarget;
  monthly: PeriodTarget;
  /** The DAILY row for `date` — null target/0 completed before it's
   *  synced/set, same as weekly/monthly. */
  daily: PeriodTarget;
}

const EMPTY_PERIOD: PeriodTarget = { target: null, completed: 0 };

const EMPTY_STATS: SiteTargetStats = {
  overall: { total: 0, completed: 0, inProgress: 0, notStarted: 0 },
  weekly: EMPTY_PERIOD,
  monthly: EMPTY_PERIOD,
  daily: EMPTY_PERIOD,
};

/**
 * `date` ("YYYY-MM-DD", typically the Home screen's workingDate) scopes the
 * weekly/monthly/daily numbers to whichever week/month/day that date falls
 * in — not always "the current one". Overall stays site-wide, unscoped by
 * date, same as before.
 */
export function useSiteStats(
  siteId: string | undefined,
  date: string,
  refreshKey: unknown,
): SiteTargetStats {
  const [stats, setStats] = useState<SiteTargetStats>(EMPTY_STATS);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;

    function load() {
      Promise.all([
        getPileStatusStatsForSite({ siteId: siteId!, search: '', locationIds: [] }),
        getSiteTargets(siteId!),
        getTargetPeriodByDate(siteId!, 'WEEKLY', date),
        getTargetPeriodByDate(siteId!, 'MONTHLY', date),
        getTargetPeriodByDate(siteId!, 'DAILY', date),
      ])
        .then(([derived, site, weekly, monthly, daily]) => {
          if (cancelled) return;
          const total = site?.siteConfig.targetPiles ?? derived.total;
          const completed = site?.siteConfig.completedPiles ?? 0;
          setStats({
            overall: {
              total,
              completed,
              inProgress: derived.inProgress,
              notStarted: Math.max(0, total - completed - derived.inProgress),
            },
            weekly: weekly
              ? { target: weekly.targetPiles, completed: weekly.completedPiles }
              : EMPTY_PERIOD,
            monthly: monthly
              ? { target: monthly.targetPiles, completed: monthly.completedPiles }
              : EMPTY_PERIOD,
            daily: daily
              ? { target: daily.targetPiles, completed: daily.completedPiles }
              : EMPTY_PERIOD,
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
  }, [siteId, date, refreshKey]);

  return stats;
}
