// src/utils/naturalSort.ts

/** Natural string order: A-1, A-2 … A-10, then alphabetical (plain localeCompare puts A-10 before A-2). */
export function compareNatural(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
