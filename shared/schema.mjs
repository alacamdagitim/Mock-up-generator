import { z } from "zod";
export const PRODUCT = Object.freeze({
  id: "doypack-v1",
  name: "Beyaz Doypack",
  widthMm: 140,
  heightMm: 210,
  canvasWidth: 600,
  canvasHeight: 900,
  print: { x: 35, y: 105, width: 530, height: 730 },
  safeInset: 24,
  approximate: true,
});
const finite = z.number().finite();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const elementSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(["text", "image", "rect", "circle"]),
    name: z.string().max(100),
    x: finite.min(-3000).max(3000),
    y: finite.min(-4500).max(4500),
    width: finite.positive().max(12000),
    height: finite.positive().max(12000),
    scaleX: finite.min(0.001).max(100),
    scaleY: finite.min(0.001).max(100),
    angle: finite.min(-36000).max(36000),
    fill: color,
    shape: z
      .enum(["square", "rounded", "pill", "triangle", "star", "line", "dashed"])
      .optional(),
    opacity: finite.min(0).max(1).optional(),
    locked: z.boolean().optional(),
    flipX: z.boolean().optional(),
    flipY: z.boolean().optional(),
    fontWeight: z.enum(["normal", "bold"]).optional(),
    fontStyle: z.enum(["normal", "italic"]).optional(),
    underline: z.boolean().optional(),
    text: z.string().max(2000).optional(),
    fontFamily: z
      .enum(["DM Sans", "Arial", "Georgia", "Verdana", "Courier New"])
      .optional(),
    fontSize: finite.min(8).max(240).optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
    src: z
      .string()
      .max(8_000_000)
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
      .optional(),
    pixelWidth: finite.positive().max(16000).optional(),
    pixelHeight: finite.positive().max(16000).optional(),
    isVector: z.boolean().optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.kind === "image" && (!v.src || !v.pixelWidth || !v.pixelHeight))
      c.addIssue({ code: "custom", message: "Görsel verisi eksik" });
    if (v.kind === "text" && (!v.text || !v.fontSize || !v.fontFamily))
      c.addIssue({ code: "custom", message: "Yazı verisi eksik" });
  });
export const DEFAULT_PRESENTATION = Object.freeze({
  material: "matte",
  background: "#dfe8f6",
  backgroundStyle: "gradient",
  exposure: 1.1,
  shadows: true,
  layout: "single",
  spacing: 1,
  lighting: "softbox",
  quality: "balanced",
});
export const presentationSchema = z
  .object({
    material: z.enum(["matte", "glossy"]),
    finishing: z.enum(["gloss", "matte", "none"]).optional(),
    substrate: z.enum(["white", "kraft", "metallic"]).optional(),
    printMode: z.enum(["color", "black", "blank"]).optional(),
    inflate: finite.min(0).max(100).optional(),
    background: color,
    backgroundStyle: z.enum(["gradient", "solid", "transparent"]),
    exposure: finite.min(0.5).max(1.8),
    shadows: z.boolean(),
    layout: z
      .enum([
        "single",
        "front-back",
        "duo",
        "trio",
        "fan",
        "stagger",
        "hero",
        "catalog",
        "side-pair",
        "tilted-duo",
        "lineup",
      ])
      .optional(),
    spacing: finite.min(0.8).max(1.6).optional(),
    lighting: z.enum(["softbox", "daylight", "dramatic"]).optional(),
    quality: z.enum(["balanced", "detail"]).optional(),
  })
  .strict();
export const designSchema = z
  .object({
    schemaVersion: z.literal(1),
    productId: z.literal("doypack-v1"),
    name: z.string().min(1).max(100),
    artboard: z
      .object({
        canvasWidth: finite.int().min(60).max(2400),
        canvasHeight: finite.int().min(60).max(2400),
        widthMm: finite.positive().max(5000).optional(),
        heightMm: finite.positive().max(5000).optional(),
        sourceUrl: z
          .string()
          .url()
          .max(2048)
          .refine((value) => {
            const url = new URL(value);
            return url.protocol === "https:" && !url.username && !url.password;
          })
          .optional(),
      })
      .strict()
      .optional(),
    updatedAt: z.string().datetime(),
    faces: z
      .object({
        front: z.array(elementSchema).max(60),
        back: z.array(elementSchema).max(60),
      })
      .strict(),
    background: color,
    presentation: presentationSchema.optional(),
  })
  .strict()
  .superRefine((d, c) => {
    let total = 0;
    for (const face of Object.values(d.faces))
      for (const el of face) total += el.src?.length || 0;
    if (total > 16_000_000)
      c.addIssue({
        code: "custom",
        message: "Toplam görsel verisi 16 MB sınırını aşıyor",
      });
  });
export function blankDesign() {
  return {
    schemaVersion: 1,
    productId: PRODUCT.id,
    name: "untitled",
    updatedAt: new Date().toISOString(),
    faces: { front: [], back: [] },
    background: "#ffffff",
  };
}
export function parseDesign(value) {
  return designSchema.parse(value);
}
/** @param {any} el
 * @param {{ canvasWidth: number, canvasHeight: number, widthMm?: number, heightMm?: number } | undefined} [artboard] */
export function effectiveDpi(el, artboard = undefined) {
  if (
    el.kind !== "image" ||
    (artboard && (!artboard.widthMm || !artboard.heightMm))
  )
    return null;
  return Math.round(
    Math.min(
      el.pixelWidth /
        ((((el.width * el.scaleX) / (artboard?.canvasWidth || 600)) *
          (artboard?.widthMm || PRODUCT.widthMm)) /
          25.4),
      el.pixelHeight /
        ((((el.height * el.scaleY) / (artboard?.canvasHeight || 900)) *
          (artboard?.heightMm || PRODUCT.heightMm)) /
          25.4),
    ),
  );
}
export function lineItemProperties(saved) {
  return {
    _alacam_design_id: saved.id,
    _alacam_design_url: saved.designUrl,
    _alacam_preview_url: saved.previewUrl,
    Tasarım: saved.id,
  };
}
