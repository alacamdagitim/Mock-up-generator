import { PRODUCT } from "../shared/schema.mjs";
import { pouchSurface } from "../shared/pouch-geometry.mjs";
import type { BufferGeometry } from "three";
import type { Face } from "./types";
/** A product adds printable faces, physical reference dimensions and a UV geometry factory. */
export type ProductDefinition = {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  canvasWidth: number;
  canvasHeight: number;
  print: { x: number; y: number; width: number; height: number };
  safeInset: number;
  approximate: boolean;
};
export type ModelAdapter = {
  product: ProductDefinition;
  surfaces: () => { face: Face; geometry: BufferGeometry }[];
};
export const modelCatalog: Record<string, ModelAdapter> = {
  "doypack-v1": {
    product: PRODUCT,
    surfaces: () => [
      { face: "front", geometry: pouchSurface(false) },
      { face: "back", geometry: pouchSurface(true) },
    ],
  },
};
export const activeModel = modelCatalog["doypack-v1"];
