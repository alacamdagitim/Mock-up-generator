import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseMockupScenes,
  mockupSceneSchema,
  MAX_MOCKUP_SCENES,
} from "../shared/mockup-scenes.mjs";

const scene = () => ({
  id: "cup-front",
  title: "Tekli bardak",
  width: 1200,
  height: 1600,
  baseImageUrl: "https://cdn.shopify.com/files/cup-base.jpg?v=20",
  distribution: "public-web",
  surfaces: [
    {
      id: "cup-print",
      face: "front",
      sourceRect: { x: 0, y: 0, width: 1, height: 1 },
      mapping: {
        type: "quad",
        points: [
          [300, 400],
          [900, 400],
          [800, 1200],
          [400, 1200],
        ],
      },
      maskUrl: "/mockups/cup-mask.png",
      shadingUrl: "/mockups/cup-shading.webp",
    },
  ],
  layers: [
    { imageUrl: "/mockups/cup-shine.png", blend: "screen", opacity: 0.5 },
  ],
});
const catalog = () => ({ schemaVersion: 1, scenes: [scene()] });

test("mockup catalog is optional and empty scenes preserve the normal editor fallback", () => {
  for (const value of [undefined, null, ""])
    assert.equal(parseMockupScenes(value), undefined);
  assert.deepEqual(parseMockupScenes({ schemaVersion: 1, scenes: [] }), {
    schemaVersion: 1,
    scenes: [],
  });
});
test("versioned mapped scenes preserve CDN versions, source rectangle and original metadata without mutation", () => {
  const input = catalog();
  const before = structuredClone(input);
  const result = parseMockupScenes(input);
  assert.deepEqual(result, input);
  assert.deepEqual(input, before);
  assert.notEqual(result, input);
  assert.match(result.scenes[0].baseImageUrl, /\?v=20$/);
});
test("mockup JSON rejects unversioned flat photos and unsupported schema versions", () => {
  for (const value of [
    "https://example.com/photo.jpg",
    { scenes: [scene()] },
    { schemaVersion: 2, scenes: [scene()] },
  ])
    assert.throws(() => parseMockupScenes(value), /mockup sahneleri geçersiz/i);
  assert.equal(
    mockupSceneSchema.safeParse({ ...scene(), surfaces: [] }).success,
    false,
  );
});
test("public preview requires an explicit public-web distribution declaration", () => {
  const value = scene();
  delete value.distribution;
  for (const distribution of [undefined, "private-server", "restricted", false])
    assert.equal(
      mockupSceneSchema.safeParse({ ...value, distribution }).success,
      false,
    );
});
test("browser assets reject executable, credentialed, insecure, SVG, PSD and cross-origin relative paths", () => {
  const invalid = [
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "http://example.com/base.png",
    "https://user:pass@example.com/base.png",
    "//example.com/base.png",
    "/\\example.com/base.png",
    "../base.png",
    "https://example.com/base.svg",
    "https://example.com/source.psd",
    "https://example.com/base.png#fragment",
  ];
  for (const baseImageUrl of invalid)
    assert.equal(
      mockupSceneSchema.safeParse({ ...scene(), baseImageUrl }).success,
      false,
      baseImageUrl,
    );
});
test("quad mapping rejects crossing, degenerate and out-of-image coordinates", () => {
  for (const points of [
    [
      [100, 100],
      [900, 100],
      [100, 900],
      [900, 900],
    ],
    [
      [100, 100],
      [100, 100],
      [100, 100],
      [100, 100],
    ],
    [
      [-1, 100],
      [900, 100],
      [900, 900],
      [100, 900],
    ],
    [
      [100, 100],
      [1300, 100],
      [900, 900],
      [100, 900],
    ],
  ]) {
    const value = scene();
    value.surfaces[0].mapping.points = points;
    assert.equal(mockupSceneSchema.safeParse(value).success, false);
  }
});
test("UV fields are explicit and arbitrary JSON URLs cannot enter raster image slots", () => {
  for (const mapping of [
    { type: "uv-rg16le", url: "https://cdn.shopify.com/files/cup-uv.bin?v=1" },
    { type: "uv-rg8", url: "/mockups/cup-uv.png" },
  ]) {
    const value = scene();
    value.surfaces[0].mapping = mapping;
    assert.equal(mockupSceneSchema.safeParse(value).success, true);
  }
  const value = scene();
  value.layers[0].imageUrl = "https://example.com/private-manifest.json";
  assert.equal(mockupSceneSchema.safeParse(value).success, false);
});
test("scene pixel budgets, normalized source bounds and surface IDs are validated before loading assets", () => {
  const values = [];
  values.push({ ...scene(), width: 8192, height: 8192 });
  values.push({ ...scene(), width: Infinity });
  const duplicate = scene();
  duplicate.surfaces.push(structuredClone(duplicate.surfaces[0]));
  values.push(duplicate);
  const outside = scene();
  outside.surfaces[0].sourceRect = { x: 0.5, y: 0, width: 1, height: 1 };
  values.push(outside);
  for (const value of values)
    assert.equal(mockupSceneSchema.safeParse(value).success, false);
  assert.throws(() =>
    parseMockupScenes({
      schemaVersion: 1,
      scenes: Array.from({ length: MAX_MOCKUP_SCENES + 1 }, (_, i) => ({
        ...scene(),
        id: `scene-${i}`,
      })),
    }),
  );
  assert.throws(() =>
    parseMockupScenes({ schemaVersion: 1, scenes: [scene(), scene()] }),
  );
});
test("unsupported mesh, file access and renderer instructions cannot be smuggled through scene settings", () => {
  for (const extra of [
    { script: "alert(1)" },
    { psdPath: "/Users/private.psd" },
    { serverToken: "secret" },
  ])
    assert.equal(
      mockupSceneSchema.safeParse({ ...scene(), ...extra }).success,
      false,
    );
});
test("all Shopify entry points read the JSON mockup metafield and escape embedded JSON", async () => {
  for (const path of [
    "../shopify/sections/alacam-tasarim-editoru.liquid",
    "../shopify/snippets/alacam-online-design-button.liquid",
    "../shopify/custom-liquid/online-design-button.liquid",
    "../shopify/custom-liquid/online-design-vercel.liquid",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(
      source,
      /"productMockupScenes":\s*\{% if .*metafields\.custom\['mockup_sahneleri'\]\.value != blank/,
    );
    assert.match(
      source,
      /replace: '<', '\\u003c'|data-config="\{\{ editor_config \| strip_newlines \| escape/,
    );
  }
});

test("16 bit UV maps require a coverage mask so artwork cannot fill the unprinted photo", () => {
  const value = scene();
  value.surfaces[0].mapping = { type: "uv-rg16le", url: "/mockups/cup.uv.bin" };
  delete value.surfaces[0].maskUrl;
  assert.throws(
    () => parseMockupScenes({ schemaVersion: 1, scenes: [value] }),
    /maskesi gerekli/,
  );
});
