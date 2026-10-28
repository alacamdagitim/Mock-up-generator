import type { z } from "zod";
import type { designSchema, elementSchema } from "../shared/schema.mjs";
export type Design = z.infer<typeof designSchema>;
export type Element = z.infer<typeof elementSchema>;
export type ArtboardSpec = NonNullable<Design["artboard"]>;
export type Face = "front" | "back";
export type ModelBinding = NonNullable<Design["modelBinding"]>;
export type SavedDesign = { id: string; designUrl: string; previewUrl: string };
export type EditorConfig = {
  apiBase?: string;
  productId?: string;
  productTitle?: string;
  productImage?: string;
  productModelUrl?: string;
  productDielineUrl?: string;
  products?: StoreProduct[];
  variants?: { id: number; title: string; available: boolean }[];
  initialVariantId?: string | number;
  cartRoot?: string;
  storageKey?: string;
  libraryKey?: string;
};
declare global {
  interface Window {
    AlacamEditorConfig?: EditorConfig;
  }
}

export type Presentation = z.infer<
  typeof import("../shared/schema.mjs").presentationSchema
>;

export type StoreProduct = {
  id: string;
  title: string;
  category: string;
  subcategory?: string;
  modelId?: string;
  image?: string;
  modelUrl?: string;
  dielineUrl?: string;
  variants: { id: number; title: string; available: boolean }[];
};
