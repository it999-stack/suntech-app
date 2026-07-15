// src/components/plan/generate/preview/previewTypes.ts
//
// Shared types for the preview step components.

export interface PreviewPile {
  id: string;
  checklistPileId: string;
  code: string;
  /** Dimension values for display - populated from joined dimension table. */
  dia: number;
  depth: number;
  rigMachineNo: string;
  craneMachineNo: string;
}
