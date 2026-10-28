import type * as THREE from "three";
import type { Presentation } from "../types";

export type RenderOptions = {
  resolution: 1024 | 2048;
  quality: "standard" | "fine";
  studio: "softbox" | "daylight" | "dramatic";
  background: "white" | "warm" | "transparent";
  aspect: "square" | "portrait" | "landscape";
};

/** An independent, owned copy of the current visible product and its textures. */
export type RenderSnapshot = {
  product: THREE.Group;
  camera: THREE.PerspectiveCamera;
  target: THREE.Vector3;
  settings: Presentation;
  dispose: () => void;
};

export type RenderProgress = {
  stage: "preparing" | "rendering" | "encoding";
  /** Actual completed path samples, including fractional tiled samples. */
  samples: number;
  total: number;
  percent: number;
  elapsedMs: number;
};

export type RenderResult = {
  blob: Blob;
  width: number;
  height: number;
  /** The full quality sample count used for the product image. */
  samples: number;
  seconds: number;
  engine: "path-tracing";
};

export type RenderContext = {
  canvas: HTMLCanvasElement;
  signal?: AbortSignal;
  onProgress?: (progress: RenderProgress) => void;
};
