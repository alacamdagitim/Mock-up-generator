import type { z } from "zod";
import type { mockupSceneSchema } from "../../shared/mockup-scenes.mjs";

export type MockupScene = z.infer<typeof mockupSceneSchema>;
export type MockupTextures = Record<"front" | "back", HTMLCanvasElement | null>;
export type MockupPreviewInfo = {
  id: string;
  title: string;
  width: number;
  height: number;
  note?: string;
};
export type MockupPreviewHandle = {
  png: () => Promise<string>;
  jpg: () => Promise<string>;
  dimensions: () => { width: number; height: number } | null;
};
