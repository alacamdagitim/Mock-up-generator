import type { Design, Face } from "./types";
/** Future production output must consume manufacturer-approved data, never inferred preview dimensions. */
export type ProductionSpecification = {
  manufacturer: string;
  templateRevision: string;
  approvedAt: string;
  faces: Record<
    Face,
    { widthMm: number; heightMm: number; bleedMm: number; safeInsetMm: number }
  >;
  dieline: { format: "svg" | "pdf"; serverAssetId: string };
  requiredDpi: number;
  colorSpace: "CMYK" | "RGB";
  iccProfileAssetId?: string;
};
export interface ProductionExporter {
  validate: (
    design: Design,
    specification: ProductionSpecification,
  ) => Promise<{ valid: boolean; issues: string[] }>;
  export: (
    design: Design,
    specification: ProductionSpecification,
  ) => Promise<Blob>;
}
// No production exporter is registered in v1. PNG export is explicitly a screen preview.
export const productionExporter: ProductionExporter | null = null;
