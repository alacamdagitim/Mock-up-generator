import test from "node:test";
import assert from "node:assert/strict";
import {
  storefrontProducts,
  productDraftKey,
  manufacturerDielineUrl,
  usesRemoteMockupCatalog,
} from "../shared/storefront.mjs";

test("prepared product JSON takes precedence over an obsolete remote PSD service", () => {
  const catalog = { schemaVersion: 1, scenes: [] };
  const config = { productId: "100", mockupApiBase: "https://offline.example" };
  assert.equal(usesRemoteMockupCatalog({ productId: "100" }), false);
  assert.equal(usesRemoteMockupCatalog(config), true);
  assert.equal(
    usesRemoteMockupCatalog({ ...config, productMockupScenes: catalog }),
    false,
  );
  assert.equal(
    usesRemoteMockupCatalog({
      ...config,
      products: [{ id: "100", title: "Ürün", mockupScenes: catalog }],
    }),
    false,
  );
  assert.equal(
    usesRemoteMockupCatalog({
      ...config,
      products: [{ id: "101", title: "Diğer ürün", mockupScenes: catalog }],
    }),
    true,
  );
});

test("standalone keeps the original local draft key and single native model", () => {
  const products = storefrontProducts({});
  assert.equal(products.length, 1);
  assert.equal(products[0].modelId, "doypack-v1");
  assert.equal(productDraftKey({}, products[0].id), "alacam:draft:v1:doypack");
});
test("merchant catalog preserves variants and leaves unmapped products unavailable", () => {
  const variants = [{ id: 10001, title: "Beyaz", available: true }];
  const products = storefrontProducts({
    productId: "100",
    products: [
      { id: "100", title: "Doypack", variants },
      { id: "101", title: "Bardak", category: "Bardak" },
      { id: "101", title: "Duplicate" },
      { id: "102", title: "Kraft doypack", modelId: "doypack-v1" },
    ],
  });
  assert.equal(products.length, 3);
  assert.equal(products[0].modelId, "doypack-v1");
  assert.deepEqual(products[0].variants, variants);
  assert.equal(products[1].modelId, undefined);
  assert.equal(products[2].modelId, "doypack-v1");
});
test("switching products isolates drafts and retains the original section draft", () => {
  const config = {
    productId: "100",
    storageKey: "alacam:section:100",
    variants: [],
  };
  assert.equal(productDraftKey(config, "100"), "alacam:section:100");
  assert.equal(
    productDraftKey(config, "101"),
    "alacam:section:100:product:101",
  );
  const products = storefrontProducts({
    ...config,
    productTitle: "Ana ürün",
    products: [{ id: "101", title: "İkinci ürün" }],
  });
  assert.equal(products[0].id, "100");
  assert.equal(products[0].title, "Ana ürün");
  assert.equal(products[1].modelId, undefined);
});

test("manufacturer files accept HTTPS but reject executable URLs and embedded credentials", () => {
  assert.equal(
    manufacturerDielineUrl("//cdn.shopify.com/files/cut.svg?v=2"),
    "https://cdn.shopify.com/files/cut.svg?v=2",
  );
  assert.equal(
    manufacturerDielineUrl("https://cdn.shopify.com/files/template.pdf?v=1"),
    "https://cdn.shopify.com/files/template.pdf?v=1",
  );
  for (const value of [
    "javascript:alert(1)",
    "data:image/svg+xml,hi",
    "http://insecure.example/a.pdf",
    "https://user:password@example.com/file",
    "invalid",
    undefined,
  ])
    assert.equal(manufacturerDielineUrl(value), null);
});

test("product file references survive launch mapping for new and existing catalog entries", () => {
  const config = {
    productId: "100",
    productTitle: "Ürün",
    productModelUrl: "https://cdn.shopify.com/files/urun.glb?v=123",
    productDielineUrl: "https://cdn.shopify.com/files/bicak.pdf?v=456",
  };
  for (const products of [undefined, [{ id: "100", title: "Ürün" }]]) {
    const [product] = storefrontProducts({ ...config, products });
    assert.equal(product.modelUrl, config.productModelUrl);
    assert.equal(product.dielineUrl, config.productDielineUrl);
    // File references do not imply that an arbitrary model has a print mapping.
    assert.equal(product.modelId, "doypack-v1");
  }
});

test("product mockup scenes follow the current Shopify product without leaking to another catalog product", () => {
  const productMockupScenes = { schemaVersion: 1, scenes: [] };
  for (const supplied of [
    undefined,
    [
      { id: "100", title: "Ürün" },
      { id: "101", title: "Diğer ürün" },
    ],
  ]) {
    const products = storefrontProducts({
      productId: "100",
      productTitle: "Ürün",
      productMockupScenes,
      products: supplied,
    });
    assert.deepEqual(products[0].mockupScenes, productMockupScenes);
    if (products[1]) assert.equal(products[1].mockupScenes, undefined);
  }
  const scenes = { schemaVersion: 1, scenes: [] };
  const supplied = [{ id: "100", title: "Ürün", mockupScenes: scenes }];
  assert.deepEqual(
    storefrontProducts({ productId: "100", products: supplied })[0]
      .mockupScenes,
    scenes,
  );
  assert.throws(
    () =>
      storefrontProducts({
        productId: "100",
        productMockupScenes: { schemaVersion: 2, scenes: [] },
      }),
    /mockup sahneleri geçersiz/,
  );
});
