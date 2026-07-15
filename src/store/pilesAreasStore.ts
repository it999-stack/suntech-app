// src/store/pilesAreasStore.ts
//
// Zustand store for locally cached piling_piles + piling_areas data.
// Single source of truth for both — replaces the old pilesStore +
// PilesContext split. Any screen that needs piles or areas reads directly
// from this store; no React Context wrapper needed.

import { create } from 'zustand';
import { getPilesBySiteWithDimensions, type PileWithDimension } from '@repositories/pilesRepository';
import { getAreasBySite } from '@repositories/areasRepository';
import type { PilingArea } from '@db/schema';

// Extended pile type for display that includes dia/depth from joined dimensions
export type DisplayPile = PileWithDimension & {
  code: string; // alias for pileIdCode
};

type PilesAreasState = {
  piles: DisplayPile[];
  areas: PilingArea[];
  isLoading: boolean;
  error: string | null;
  currentSiteId: string | null;

  /** Load piles + areas for a site. Called on mount and after sync. */
  loadAll: (siteId: string | undefined | null) => Promise<void>;
  /** Reload piles + areas for the current site. Called after sync completes. */
  reload: () => Promise<void>;
  /** Clear piles + areas (e.g., on logout or site change). */
  clear: () => void;
};

export const usePilesAreasStore = create<PilesAreasState>((set, get) => ({
  piles: [],
  areas: [],
  isLoading: false,
  error: null,
  currentSiteId: null,

  loadAll: async (siteId: string | undefined | null) => {
    // Clear state if no siteId provided (e.g., on logout)
    if (!siteId) {
      set({ piles: [], areas: [], error: null, currentSiteId: null });
      return;
    }

    set({ isLoading: true, error: null, currentSiteId: siteId });
    try {
      const [pilesRaw, areas] = await Promise.all([
        getPilesBySiteWithDimensions(siteId),
        getAreasBySite(siteId),
      ]);
      set({ 
        piles: pilesRaw.map(p => ({ ...p, code: p.pileIdCode })), 
        areas, 
        isLoading: false 
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load piles/areas',
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
    set({ piles: [], areas: [], error: null, currentSiteId: null });
  },
}));
