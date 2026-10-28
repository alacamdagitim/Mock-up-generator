import test from "node:test";
import assert from "node:assert/strict";
import {
  storefrontProducts,
  productDraftKey,
  manufacturerDielineUrl,
} from "../shared/storefront.mjs";

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
