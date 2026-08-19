// src/hooks/useElapsedSeconds.ts
//
// Ticks once a second, returning whole seconds elapsed since `since` (an ISO
// timestamp). Pass null while there's nothing to count from (e.g. no open
// idle session) — the hook stays at 0 and never starts an interval.

import { useEffect, useState } from 'react';

export function useElapsedSeconds(since: string | null): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!since) {
      setSeconds(0);
      return;
    }

    const sinceMs = new Date(since).getTime();
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - sinceMs) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [since]);

  return seconds;
}
