import type { z } from "zod";
import type { designSchema, elementSchema } from "../shared/schema.mjs";
export type Design = z.infer<typeof designSchema>;
export type Element = z.infer<typeof elementSchema>;
export type ArtboardSpec = NonNullable<Design["artboard"]>;
export type Face = "front" | "back";
export type ModelBinding = NonNullable<Design["modelBinding"]>;
export type MockupScene = z.infer<
  typeof import("../shared/mockup-scenes.mjs").mockupSceneSchema
>;
export type MockupScenes = z.infer<
  typeof import("../shared/mockup-scenes.mjs").mockupScenesSchema
>;
export type MockupImage = z.infer<
  typeof import("../shared/mockup-scenes.mjs").mockupImageSchema
>;
export type MockupCard = {
  id: string;
  title: string;
  imageUrl: string;
  sceneId?: string;
  ready: boolean;
  pendingReason?: string;
};
export type ResolvedProductMockups = {
  cards: MockupCard[];
  scenes: MockupScene[];
};
export type SavedDesign = {
  id: string;
  designUrl: string;
  previewUrl: string;
  productId: string;
  variantId: string | null;
  createdAt?: string;
};
export type ProductOption = {
  name: string;
  position: number;
  values: string[];
};
export type StoreVariant = {
  id: number;
  title: string;
  available: boolean;
  /** Shopify Liquid money values: one hundredth of a currency unit. */
  price?: number;
  compareAtPrice?: number;
  options?: string[];
  sku?: string;
  quantityRule?: { min: number; increment: number; max?: number | null };
  quantityPriceBreaks?: { minimumQuantity: number; price: number }[];
  /** Physical pieces per one Shopify cart item, explicitly supplied by the merchant. */
  unitsPerItem?: number;
  unitPrice?: number;
  unitPriceMeasurement?: {
    measuredType: string;
    quantityValue: number;
    quantityUnit: string;
    referenceValue: number;
    referenceUnit: string;
  };
};
export type EditorConfig = {
  apiBase?: string;
  productId?: string;
  productTitle?: string;
  productImage?: string;
  productModelUrl?: string;
  productDielineUrl?: string;
  productMockupScenes?: MockupScenes;
  productMockupImages?: MockupImage[];
  products?: StoreProduct[];
  variants?: StoreVariant[];
  productOptions?: ProductOption[];
  productHandle?: string;
  productUrl?: string;
  currency?: string;
  locale?: string;
  requiresSellingPlan?: boolean;
  initialVariantId?: string | number;
  initialQuantity?: number;
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
  mockupScenes?: MockupScenes;
  mockupImages?: MockupImage[];
  variants: StoreVariant[];
  productOptions?: ProductOption[];
  handle?: string;
  url?: string;
  currency?: string;
  locale?: string;
  requiresSellingPlan?: boolean;
};
