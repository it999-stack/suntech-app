// src/hooks/usePiles.ts
// Fetches piling_piles rows from local SQLite for the current site.
// Re-fetches automatically on screen focus so the UI reflects post-sync data.

import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getPilesBySite } from '../repositories/pilesRepository';
import type { PilingPile } from '../db/schema';

type UsePilesResult = {
  piles: PilingPile[];
  isLoading: boolean;
  error: string | null;
  reload: () => void;
};

/**
 * Loads all locally cached piles for `siteId` from SQLite.
 * Re-queries every time the screen comes into focus so that a sync
 * triggered from the Profile tab is immediately reflected here.
 */
export function usePiles(siteId: string | undefined): UsePilesResult {
  const [piles, setPiles] = useState<PilingPile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!siteId) {
      setPiles([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const rows = await getPilesBySite(siteId);
      setPiles(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load piles');
    } finally {
      setIsLoading(false);
    }
  }, [siteId]);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // Re-load whenever the screen gains focus (picks up post-sync data)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return { piles, isLoading, error, reload: load };
}
