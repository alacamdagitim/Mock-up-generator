import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMockupImages,
  parseMockupScenes,
  resolveProductMockups,
  MAX_MOCKUP_IMAGES,
  MAX_MOCKUP_SCENES,
} from "../shared/mockup-scenes.mjs";
import { storefrontProducts } from "../shared/storefront.mjs";

const scene = (id, overrides = {}) => ({
  id,
  title: `Hazırlanan ${id}`,
  width: 100,
  height: 100,
  baseImageUrl: `https://cdn.shopify.com/files/${id}.png?v=1`,
  thumbnailUrl: `https://cdn.shopify.com/files/${id}-branded.png`,
  distribution: "public-web",
  surfaces: [
    {
      id: "print",
      face: "front",
      mapping: {
        type: "quad",
        points: [
          [10, 10],
          [90, 10],
          [90, 90],
          [10, 90],
        ],
      },
    },
  ],
  ...overrides,
});
const image = (id, filename = "cup") => ({
  id,
  title: `Görsel ${id}`,
  imageUrl: `https://cdn.shopify.com/files/${filename}.jpg?v=2`,
});
const catalog = (...scenes) => parseMockupScenes({ schemaVersion: 1, scenes });

test("missing image metafields retain legacy scenes while an explicit empty list removes the gallery", () => {
  for (const value of [undefined, null, ""])
    assert.equal(parseMockupImages(value), undefined);
  const prepared = scene("studio");
  const product = { mockupScenes: catalog(prepared) };
  assert.deepEqual(resolveProductMockups(product), {
    scenes: [prepared],
    cards: [
      {
        id: "studio",
        title: prepared.title,
        imageUrl: prepared.baseImageUrl,
        sceneId: "studio",
        ready: true,
      },
    ],
  });
  assert.deepEqual(resolveProductMockups({ ...product, mockupImages: [] }), {
    cards: [],
    scenes: [],
  });
});

test("merchant image files validate stable Shopify IDs, raster URLs, size and uniqueness", () => {
  for (const id of [
    "12345678901234",
    "gid://shopify/MediaImage/123",
    "gid://shopify/Image/321",
  ])
    assert.equal(parseMockupImages([image(id)])[0].id, id);
  const original = [image("123")];
  assert.deepEqual(parseMockupImages(original), original);
  assert.notEqual(parseMockupImages(original), original);
  for (const value of [
    "https://cdn.shopify.com/files/cup.jpg",
    [image("../../file")],
    [image("gid://different/Image/123")],
    [image("0")],
    [image("123"), image("123")],
    Array.from({ length: MAX_MOCKUP_IMAGES + 1 }, (_, i) =>
      image(String(i + 1)),
    ),
    [{ ...image("123"), title: " " }],
    [{ ...image("123"), script: "not public data" }],
  ])
    assert.throws(() => parseMockupImages(value), /mockup görselleri geçersiz/);
  for (const imageUrl of [
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "http://example.com/cup.png",
    "https://secret@example.com/cup.png",
    "//example.com/cup.png",
    "/\\example.com/cup.png",
    "../cup.png",
    "/cup.svg",
    "/cup.psd",
    "/cup.png#fragment",
  ])
    assert.throws(
      () => parseMockupImages([{ ...image("123"), imageUrl }]),
      /mockup görselleri geçersiz/,
    );
});

test("product galleries accept 64 bounded prepared scenes without the former eight-scene limit", () => {
  assert.equal(MAX_MOCKUP_SCENES, 64);
  const scenes = Array.from({ length: MAX_MOCKUP_SCENES }, (_, index) =>
    scene(`scene-${index}`, { shopifyImageId: String(index + 1) }),
  );
  const photos = Array.from({ length: MAX_MOCKUP_IMAGES }, (_, index) =>
    image(String(index + 1)),
  );
  const result = resolveProductMockups({
    mockupScenes: catalog(...scenes),
    mockupImages: parseMockupImages(photos),
  });
  assert.equal(result.cards.length, 64);
  assert.equal(result.scenes.length, 64);
  assert.equal(result.cards[63].sceneId, "scene-63");
});

test("legacy scenes use only explicit plain thumbnails, retaining full-resolution matching and exports", () => {
  const prepared = scene("studio", {
    plainThumbnailUrl:
      "https://cdn.shopify.com/files/studio_480x.png?width=480",
  });
  const result = resolveProductMockups({ mockupScenes: catalog(prepared) });
  assert.equal(result.cards[0].imageUrl, prepared.plainThumbnailUrl);
  assert.equal(result.scenes[0].baseImageUrl, prepared.baseImageUrl);
  const byOriginal = resolveProductMockups({
    mockupScenes: catalog(prepared),
    mockupImages: [{ ...image("123"), imageUrl: prepared.baseImageUrl }],
  });
  assert.equal(byOriginal.cards[0].sceneId, "studio");
  const byThumbnail = resolveProductMockups({
    mockupScenes: catalog(prepared),
    mockupImages: [{ ...image("123"), imageUrl: prepared.plainThumbnailUrl }],
  });
  assert.equal(byThumbnail.cards[0].ready, false);
  for (const plainThumbnailUrl of [
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "http://example.com/cup.png",
    "https://secret@example.com/cup.png",
    "//example.com/cup.png",
    "/cup.svg",
    "/source.psd",
    "/cup.png#fragment",
  ])
    assert.throws(
      () => catalog({ ...prepared, plainThumbnailUrl }),
      /mockup sahneleri geçersiz/,
    );
});

test("stable file bindings survive titles and filename changes and follow merchant gallery ordering", () => {
  const first = scene("hand-r1", { shopifyImageId: "123" });
  const second = scene("studio-r1", { shopifyImageId: "456" });
  const photos = [image("456", "renamed-studio"), image("123", "renamed-hand")];
  photos[1].title = "Yeni başlık";
  const result = resolveProductMockups({
    mockupScenes: catalog(first, second),
    mockupImages: parseMockupImages(photos),
  });
  assert.deepEqual(
    result.scenes.map((value) => value.id),
    ["studio-r1", "hand-r1"],
  );
  assert.deepEqual(
    result.cards.map((value) => value.sceneId),
    ["studio-r1", "hand-r1"],
  );
  assert.equal(result.cards[1].title, "Yeni başlık");
  assert.equal(result.cards[1].imageUrl, photos[1].imageUrl);
  assert.ok(result.cards.every((value) => value.ready));
});

test("plain thumbnails are validated and used only for cards, never scene matching or export sources", () => {
  const prepared = scene("studio", {
    baseImageUrl: "https://cdn.shopify.com/files/source.jpg?v=1",
  });
  const photo = {
    ...image("123", "source"),
    thumbnailUrl: "https://cdn.shopify.com/files/source_480x.jpg?v=2&width=480",
  };
  const result = resolveProductMockups({
    mockupScenes: catalog(prepared),
    mockupImages: parseMockupImages([photo]),
  });
  assert.equal(result.cards[0].imageUrl, photo.thumbnailUrl);
  assert.equal(result.cards[0].sceneId, "studio");
  assert.equal(result.scenes[0].baseImageUrl, prepared.baseImageUrl);
  const pending = resolveProductMockups({
    mockupScenes: catalog(prepared),
    mockupImages: [
      {
        ...photo,
        imageUrl: "https://cdn.shopify.com/files/different.jpg",
        thumbnailUrl: prepared.baseImageUrl,
      },
    ],
  });
  assert.equal(pending.cards[0].ready, false);
  assert.equal(pending.cards[0].imageUrl, prepared.baseImageUrl);
  assert.equal(pending.scenes.length, 0);
  for (const thumbnailUrl of [
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "http://example.com/cup.png",
    "https://secret@example.com/cup.png",
    "//example.com/cup.png",
    "/cup.svg",
    "/source.psd",
    "/cup.png#fragment",
  ])
    assert.throws(
      () => parseMockupImages([{ ...photo, thumbnailUrl }]),
      /mockup görselleri geçersiz/,
    );
});

test("removing an image removes its scene and adding a raw photo leaves an explicit pending card", () => {
  const result = resolveProductMockups({
    mockupScenes: catalog(
      scene("removed", { shopifyImageId: "123" }),
      scene("kept", { shopifyImageId: "456" }),
    ),
    mockupImages: [image("456"), image("789", "new")],
  });
  assert.deepEqual(
    result.scenes.map((value) => value.id),
    ["kept"],
  );
  assert.equal(result.cards.length, 2);
  assert.equal(result.cards[1].ready, false);
  assert.equal(result.cards[1].sceneId, undefined);
  assert.match(result.cards[1].pendingReason, /henüz hazırlanmadı/);
});

test("legacy URL binding ignores only the query and does not infer a mapping from filename or list position", () => {
  const legacy = scene("legacy", { baseImageUrl: "/mockups/base.png?v=1" });
  const images = [
    { ...image("123"), imageUrl: "/mockups/base.png?v=999&width=800" },
    { ...image("456"), imageUrl: "https://other.example/mockups/base.png" },
    { ...image("789"), imageUrl: "/different/base.png" },
  ];
  const result = resolveProductMockups({
    mockupScenes: catalog(legacy),
    mockupImages: images,
  });
  assert.equal(result.cards[0].sceneId, "legacy");
  assert.equal(result.cards[1].ready, false);
  assert.equal(result.cards[2].ready, false);
  const renamed = resolveProductMockups({
    mockupScenes: catalog(legacy),
    mockupImages: [{ ...images[0], imageUrl: "/mockups/renamed.png" }],
  });
  assert.equal(renamed.cards[0].ready, false);
});

test("a scene declaring another stable file ID never falls back to the same URL", () => {
  const photo = image("123");
  const result = resolveProductMockups({
    mockupImages: [photo],
    mockupScenes: catalog(
      scene("wrong", { shopifyImageId: "456", baseImageUrl: photo.imageUrl }),
    ),
  });
  assert.equal(result.cards[0].ready, false);
  assert.equal(result.scenes.length, 0);
});

test("duplicate file scene mappings and one URL scene shared by several files stay disabled", () => {
  const duplicate = resolveProductMockups({
    mockupImages: [image("123")],
    mockupScenes: catalog(
      scene("one", { shopifyImageId: "123" }),
      scene("two", { shopifyImageId: "123" }),
    ),
  });
  assert.equal(duplicate.cards[0].ready, false);
  assert.match(duplicate.cards[0].pendingReason, /birden fazla/);
  assert.equal(duplicate.scenes.length, 0);
  const shared = resolveProductMockups({
    mockupImages: [image("123"), image("456")],
    mockupScenes: catalog(
      scene("one", { baseImageUrl: image("123").imageUrl }),
    ),
  });
  assert.ok(shared.cards.every((card) => !card.ready && !card.sceneId));
  assert.equal(shared.scenes.length, 0);
});

test("a stable ID mapping takes precedence over an unrelated old URL mapping", () => {
  const photo = image("123");
  const result = resolveProductMockups({
    mockupImages: [photo],
    mockupScenes: catalog(
      scene("new", { shopifyImageId: "123" }),
      scene("old", { baseImageUrl: photo.imageUrl }),
    ),
  });
  assert.equal(result.cards[0].sceneId, "new");
  assert.equal(result.scenes.length, 1);
});

test("storefront mapping keeps image lists and preparation catalogs isolated to each product", () => {
  const ownImages = [image("123")];
  const otherImages = [image("456")];
  const products = storefrontProducts({
    productId: "100",
    productMockupImages: ownImages,
    productMockupScenes: catalog(scene("own", { shopifyImageId: "123" })),
    products: [
      { id: "100", title: "Birinci" },
      { id: "101", title: "İkinci", mockupImages: otherImages },
    ],
  });
  assert.deepEqual(products[0].mockupImages, ownImages);
  assert.deepEqual(products[1].mockupImages, otherImages);
  assert.equal(resolveProductMockups(products[0]).scenes[0].id, "own");
  assert.equal(resolveProductMockups(products[1]).cards[0].ready, false);
  assert.equal(products[1].mockupScenes, undefined);
  assert.equal(
    storefrontProducts({
      productId: "100",
      productTitle: "Ürün",
      productMockupImages: ownImages,
    })[0].mockupImages[0].id,
    "123",
  );
  assert.deepEqual(
    storefrontProducts({
      productId: "100",
      productMockupImages: [],
      products,
    })[0].mockupImages,
    [],
  );
});
