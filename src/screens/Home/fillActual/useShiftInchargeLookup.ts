// src/screens/Home/fillActual/useShiftInchargeLookup.ts
//
// Shift Incharge (Shift 1) for the header subtitle — the closest equivalent
// to what "supervisor" used to mean before the multi-role system replaced
// it.

import { useEffect, useState } from 'react';
import { getChecklistPersonnel } from '@repositories/checklistRepository';
import type { PilingDailyChecklist } from '@db/schema';

export function useShiftInchargeLookup(args: {
  checklist: PilingDailyChecklist | null;
}): { shiftIncharge1Id: string | null } {
  const { checklist } = args;
  const [shiftIncharge1Id, setShiftIncharge1Id] = useState<string | null>(null);

  useEffect(() => {
    if (!checklist) {
      setShiftIncharge1Id(null);
      return;
    }
    getChecklistPersonnel(checklist.id)
      .then((rows) => {
        const row = rows.find((r) => r.role === 'SHIFT_INCHARGE' && r.shiftSlot === 1);
        setShiftIncharge1Id(row?.personnelId ?? null);
      })
      .catch(() => setShiftIncharge1Id(null));
  }, [checklist]);

  return { shiftIncharge1Id };
}
