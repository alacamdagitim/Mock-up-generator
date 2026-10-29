import { z } from "zod";

export const MOCKUP_SCENE_VERSION = 1;
export const MAX_MOCKUP_SCENES = 64;
export const MAX_MOCKUP_IMAGES = MAX_MOCKUP_SCENES;
export const MAX_MOCKUP_PIXELS = 16_777_216;

/** Shopify's image.src may be "files/name.png", not a browser-ready URL. */
export function normalizeShopifyFileReference(value) {
  if (typeof value !== "string" || !value.startsWith("files/")) return value;
  const path = `/cdn/shop/${value}`;
  try {
    const url = new URL(path, "https://alacam.invalid");
    // Do not interpret traversal or another relative path as a Shopify file.
    return !value.includes("\\") && url.pathname.startsWith("/cdn/shop/files/")
      ? path
      : value;
  } catch {
    return value;
  }
}

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
const assetUrl = z.preprocess(
  normalizeShopifyFileReference,
  z.string().min(1).max(2048).refine(safeAssetUrl, {
    message:
      "Mockup dosyaları HTTPS veya / ile başlayan güvenli adresler olmalı.",
  }),
);
const rasterUrl = assetUrl.refine((value) => {
  const path = new URL(value, "https://alacam.invalid").pathname;
  return /\.(png|jpe?g|webp)$/i.test(path);
}, "Mockup görselleri PNG, JPG veya WebP olmalı; PSD ve SVG doğrudan kullanılamaz.");
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
// Liquid image IDs may be numeric or GraphQL IDs. The original file ID stays
// stable when the merchant changes its title/filename; a URL does not.
const shopifyImageId = z
  .string()
  .min(1)
  .max(200)
  .regex(
    /^(?:[1-9]\d*|gid:\/\/shopify\/(?:Image|MediaImage|GenericFile)\/[1-9]\d*)$/,
  );
export const mockupImageSchema = z
  .object({
    id: shopifyImageId,
    title: z.string().trim().min(1).max(120),
    imageUrl: rasterUrl,
    thumbnailUrl: rasterUrl.optional(),
  })
  .strict();
export const mockupImagesSchema = z
  .array(mockupImageSchema)
  .max(MAX_MOCKUP_IMAGES)
  .superRefine((images, context) => {
    const ids = new Set();
    images.forEach((image, index) => {
      if (ids.has(image.id))
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Mockup görseli kimlikleri benzersiz olmalı.",
        });
      ids.add(image.id);
    });
  });
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
    shopifyImageId: shopifyImageId.optional(),
    width: z.number().int().min(1).max(8192),
    height: z.number().int().min(1).max(8192),
    baseImageUrl: rasterUrl,
    thumbnailUrl: rasterUrl.optional(),
    // Explicitly identifies an unprinted resized photograph for Layout cards.
    // Legacy thumbnailUrl may contain sample artwork and is not used here.
    plainThumbnailUrl: rasterUrl.optional(),
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

/** An explicit empty list removes all product mockups; absence keeps legacy JSON. */
export function parseMockupImages(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const result = mockupImagesSchema.safeParse(value);
  if (!result.success) {
    const reason =
      result.error.issues[0]?.message || "Görsel listesi geçersiz.";
    throw new Error(`Ürünün mockup görselleri geçersiz: ${reason}`);
  }
  return result.data;
}

function canonicalImageUrl(value) {
  const url = new URL(value, "https://alacam.invalid");
  return `${url.origin}${url.pathname}`;
}

/**
 * Resolve only the current product's prepared scenes. Image list order is the
 * gallery order; no filename, alt text, list index or other-product guess is used.
 *
 * @param {{mockupImages?: import("../src/types").MockupImage[], mockupScenes?: import("../src/types").MockupScenes}} product
 * @returns {import("../src/types").ResolvedProductMockups}
 */
export function resolveProductMockups(product) {
  const scenes = product.mockupScenes?.scenes || [];
  if (product.mockupImages === undefined)
    return {
      cards: scenes.map((scene) => ({
        id: scene.id,
        title: scene.title,
        imageUrl: scene.plainThumbnailUrl || scene.baseImageUrl,
        sceneId: scene.id,
        ready: true,
      })),
      scenes,
    };

  const candidates = product.mockupImages.map((image) => {
    const byId = scenes.filter((scene) => scene.shopifyImageId === image.id);
    if (byId.length) return byId;
    const imageUrl = canonicalImageUrl(image.imageUrl);
    return scenes.filter(
      (scene) =>
        !scene.shopifyImageId &&
        canonicalImageUrl(scene.baseImageUrl) === imageUrl,
    );
  });
  // A single legacy scene matching several gallery files is ambiguous too.
  const uses = new Map();
  candidates.forEach((matches) => {
    if (matches.length === 1)
      uses.set(matches[0].id, (uses.get(matches[0].id) || 0) + 1);
  });
  const cards = product.mockupImages.map((image, index) => {
    const matches = candidates[index];
    // Cards need only the small plain photograph; original imageUrl above is
    // still the binding source and scene.baseImageUrl stays the export source.
    const card = {
      id: image.id,
      title: image.title,
      imageUrl: image.thumbnailUrl || image.imageUrl,
    };
    if (matches.length === 1 && uses.get(matches[0].id) === 1)
      return { ...card, sceneId: matches[0].id, ready: true };
    return {
      ...card,
      ready: false,
      pendingReason: matches.length
        ? "Bu görsel için birden fazla baskı eşlemesi bulundu. Sahne bağlantısını kontrol edin."
        : "Bu görsel için baskı eşlemesi henüz hazırlanmadı.",
    };
  });
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  return {
    cards,
    scenes: cards.flatMap((card) =>
      card.sceneId ? [byId.get(card.sceneId)] : [],
    ),
  };
}
