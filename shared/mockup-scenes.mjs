import { z } from "zod";

export const MOCKUP_SCENE_VERSION = 1;
export const MAX_MOCKUP_SCENES = 8;
export const MAX_MOCKUP_PIXELS = 16_777_216;

/** Browser scenes must contain merchant-authorized public web assets only. */
function safeAssetUrl(value) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.includes("\\")
  )
    return false;
  // Root-relative files stay on the current origin. No scheme-relative hosts.
  if (value.startsWith("/") && !value.startsWith("//")) {
    try {
      const url = new URL(value, "https://alacam.invalid");
      return url.origin === "https://alacam.invalid" && !url.hash;
    } catch {
      return false;
    }
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" && !url.username && !url.password && !url.hash
    );
  } catch {
    return false;
  }
}
const assetUrl = z.string().min(1).max(2048).refine(safeAssetUrl, {
  message:
    "Mockup dosyaları HTTPS veya / ile başlayan güvenli adresler olmalı.",
});
const rasterUrl = assetUrl.refine((value) => {
  const path = new URL(value, "https://alacam.invalid").pathname;
  return /\.(png|jpe?g|webp)$/i.test(path);
}, "Mockup görselleri PNG, JPG veya WebP olmalı; PSD ve SVG doğrudan kullanılamaz.");
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const finite = z.number().finite();
const point = z.tuple([finite.min(0).max(8192), finite.min(0).max(8192)]);
const sourceRect = z
  .object({
    x: finite.min(0).max(1),
    y: finite.min(0).max(1),
    width: finite.positive().max(1),
    height: finite.positive().max(1),
  })
  .strict()
  .refine(
    (v) => v.x + v.width <= 1.000001 && v.y + v.height <= 1.000001,
    "Kaynak baskı bölgesi tasarım sınırlarının içinde olmalı.",
  );
const mapping = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("quad"),
      points: z.tuple([point, point, point, point]),
    })
    .strict(),
  z.object({ type: z.literal("uv-rg16le"), url: assetUrl }).strict(),
  z.object({ type: z.literal("uv-rg8"), url: rasterUrl }).strict(),
]);
export const mockupSurfaceSchema = z
  .object({
    id,
    face: z.enum(["front", "back"]),
    backgroundMode: z.enum(["design", "transparent"]).optional(),
    sourceRect: sourceRect.optional(),
    mapping,
    maskUrl: rasterUrl.optional(),
    shadingUrl: rasterUrl.optional(),
    opacity: finite.min(0).max(1).optional(),
    blend: z.enum(["source-over", "multiply"]).optional(),
  })
  .strict();
export const mockupSceneSchema = z
  .object({
    id,
    title: z.string().min(1).max(120),
    width: z.number().int().min(1).max(8192),
    height: z.number().int().min(1).max(8192),
    baseImageUrl: rasterUrl,
    thumbnailUrl: rasterUrl.optional(),
    // This is an explicit merchant declaration, not an inferred asset license.
    // Restricted PSD/source passes belong on a separate private server pipeline.
    distribution: z.literal("public-web"),
    license: z.string().max(500).optional(),
    surfaces: z.array(mockupSurfaceSchema).min(1).max(8),
    layers: z
      .array(
        z
          .object({
            imageUrl: rasterUrl,
            blend: z.enum([
              "source-over",
              "multiply",
              "screen",
              "overlay",
              "soft-light",
            ]),
            opacity: finite.min(0).max(1).optional(),
          })
          .strict(),
      )
      .max(16)
      .optional(),
  })
  .strict()
  .superRefine((scene, context) => {
    if (scene.width * scene.height > MAX_MOCKUP_PIXELS)
      context.addIssue({
        code: "custom",
        message: "Mockup sahnesi en fazla 16 megapiksel olabilir.",
      });
    const seen = new Set();
    scene.surfaces.forEach((surface, index) => {
      const path = ["surfaces", index];
      if (seen.has(surface.id))
        context.addIssue({
          code: "custom",
          path,
          message: "Baskı yüzeyi kimlikleri benzersiz olmalı.",
        });
      seen.add(surface.id);
      if (surface.mapping.type === "uv-rg16le" && !surface.maskUrl)
        context.addIssue({
          code: "custom",
          path: [...path, "maskUrl"],
          message: "16 bit UV eşlemesi için baskı maskesi gerekli.",
        });
      if (surface.mapping.type !== "quad") return;
      const points = surface.mapping.points;
      if (points.some(([x, y]) => x > scene.width || y > scene.height))
        context.addIssue({
          code: "custom",
          path: [...path, "mapping", "points"],
          message: "Yerleştirme noktaları sahne sınırlarının içinde olmalı.",
        });
      // TL, TR, BR, BL must form a non-degenerate convex polygon in image pixels.
      const crosses = points.map((p, i) => {
        const q = points[(i + 1) % 4],
          r = points[(i + 2) % 4];
        return (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
      });
      if (!(
        crosses.every((v) => v > 0.0001) || crosses.every((v) => v < -0.0001)
      ))
        context.addIssue({
          code: "custom",
          path: [...path, "mapping", "points"],
          message:
            "Baskı alanı saat yönünde sıralanmış dört dışbükey köşeden oluşmalı.",
        });
    });
  });
export const mockupScenesSchema = z
  .object({
    schemaVersion: z.literal(MOCKUP_SCENE_VERSION),
    scenes: z.array(mockupSceneSchema).max(MAX_MOCKUP_SCENES),
  })
  .strict()
  .superRefine((catalog, context) => {
    const ids = new Set();
    catalog.scenes.forEach((scene, index) => {
      if (ids.has(scene.id))
        context.addIssue({
          code: "custom",
          path: ["scenes", index, "id"],
          message: "Mockup sahne kimlikleri benzersiz olmalı.",
        });
      ids.add(scene.id);
    });
  });

/** An absent metafield is valid and retains the normal 2D/3D editor fallback. */
export function parseMockupScenes(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const result = mockupScenesSchema.safeParse(value);
  if (!result.success) {
    const reason = result.error.issues[0]?.message || "JSON yapısı geçersiz.";
    throw new Error(`Ürünün mockup sahneleri geçersiz: ${reason}`);
  }
  return result.data;
}
