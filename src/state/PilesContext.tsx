// src/state/PilesContext.tsx
//
// Provides locally cached piling_piles data to any screen in the tree.
// Both PilesScreen and the Generate Plan screen consume this context
// so they share the same loaded data without double-querying SQLite.

import React, { createContext, useContext } from 'react';
import { usePiles } from '../hooks/usePiles';
import { useAuthStore } from '../store/authStore';
import type { PilingPile } from '../db/schema';

type PilesContextValue = {
  /** All piles for the user's site, loaded from local SQLite. */
  piles: PilingPile[];
  isLoading: boolean;
  error: string | null;
  /** Call this after a sync completes to refresh the pile list. */
  reload: () => void;
};

const PilesContext = createContext<PilesContextValue | undefined>(undefined);

export function PilesProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const { piles, isLoading, error, reload } = usePiles(user?.siteId);

  return (
    <PilesContext.Provider value={{ piles, isLoading, error, reload }}>
      {children}
    </PilesContext.Provider>
  );
}

export function usePilesContext(): PilesContextValue {
  const ctx = useContext(PilesContext);
  if (!ctx) throw new Error('usePilesContext must be used within a PilesProvider');
  return ctx;
}
