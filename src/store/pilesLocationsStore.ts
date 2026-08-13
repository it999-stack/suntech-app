// src/store/pilesLocationsStore.ts
//
// Zustand store for locally cached piling_piles + piling_locations data.
// Single source of truth for both — replaces the old pilesStore +
// PilesContext split. Any screen that needs piles or locations reads
// directly from this store; no React Context wrapper needed.

import { create } from 'zustand';
import { getPilesBySiteWithDimensions, type PileWithDimension } from '@repositories/pilesRepository';
import { getLocationsBySite } from '@repositories/locationsRepository';
import { getDimensionsBySite } from '@repositories/dimensionsRepository';
import type { PilingLocation, PilingDimension } from '@db/schema';

// Extended pile type for display that includes dia/depth from joined dimensions
export type DisplayPile = PileWithDimension & {
  code: string; // alias for pileIdCode
};

type PilesLocationsState = {
  piles: DisplayPile[];
  locations: PilingLocation[];
  dimensions: PilingDimension[];
  isLoading: boolean;
  error: string | null;
  currentSiteId: string | null;

  /** Load piles + locations for a site. Called on mount and after sync. */
  loadAll: (siteId: string | undefined | null) => Promise<void>;
  /** Reload piles + locations for the current site. Called after sync completes. */
  reload: () => Promise<void>;
  /** Clear piles + locations (e.g., on logout or site change). */
  clear: () => void;
};

export const usePilesLocationsStore = create<PilesLocationsState>((set, get) => ({
  piles: [],
  locations: [],
  dimensions: [],
  isLoading: false,
  error: null,
  currentSiteId: null,

  loadAll: async (siteId: string | undefined | null) => {
    // Clear state if no siteId provided (e.g., on logout)
    if (!siteId) {
      set({ piles: [], locations: [], dimensions: [], error: null, currentSiteId: null });
      return;
    }

    set({ isLoading: true, error: null, currentSiteId: siteId });
    try {
      const [pilesRaw, locations, dimensions] = await Promise.all([
        getPilesBySiteWithDimensions(siteId),
        getLocationsBySite(siteId),
        getDimensionsBySite(siteId),
      ]);
      set({
        piles: pilesRaw.map(p => ({ ...p, code: p.pileIdCode })),
        locations,
        dimensions,
        isLoading: false
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load piles/locations',
        isLoading: false,
      });
    }
  },

  reload: async () => {
    const siteId = get().currentSiteId;
    if (siteId) {
      await get().loadAll(siteId);
    }
  },

  clear: () => {
    set({ piles: [], locations: [], dimensions: [], error: null, currentSiteId: null });
  },
}));
