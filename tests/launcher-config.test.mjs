import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../src/launcherConfig.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(
  source.replace(
    "../shared/mockup-scenes.mjs",
    new URL("../shared/mockup-scenes.mjs", import.meta.url).href,
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
);
const { validateLaunchConfig } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const config = {
  productId: "100",
  variants: [{ id: 10001, title: "Beyaz", available: true }],
};

test("launcher preserves Shopify file versions and normalizes CDN protocol for both asset references", () => {
  const result = validateLaunchConfig({
    ...config,
    productModelUrl: "//cdn.shopify.com/files/model.glb?v=1",
    productDielineUrl: "https://cdn.shopify.com/files/cut.svg?v=2",
  });
  assert.equal(
    result.productModelUrl,
    "https://cdn.shopify.com/files/model.glb?v=1",
  );
  assert.equal(
    result.productDielineUrl,
    "https://cdn.shopify.com/files/cut.svg?v=2",
  );
  assert.equal(validateLaunchConfig(config).productModelUrl, undefined);
  assert.equal(validateLaunchConfig(config).productDielineUrl, undefined);
});

test("launcher rejects executable and credential-bearing URLs in both file fields", () => {
  for (const key of ["productModelUrl", "productDielineUrl"]) {
    for (const value of [
      "javascript:alert(1)",
      "data:model/gltf-binary;base64,AAAA",
      "https://user:pass@example.com/file",
      "http://example.com/file",
    ]) {
      assert.throws(
        () => validateLaunchConfig({ ...config, [key]: value }),
        /güvenli bir dosya/,
      );
    }
  }
});

test("legacy Shopify file references use the storefront CDN root instead of the product directory", () => {
  const result = validateLaunchConfig(
    {
      ...config,
      productModelUrl: "files/cup.glb?v=7",
      productDielineUrl: "files/cut.svg?v=8",
      productMockupImages: [
        {
          id: "46582867427634",
          title: "Mockup 1",
          imageUrl: "files/base.png",
          thumbnailUrl:
            "https://alacamdagitim.com/cdn/shop/files/base.png?v=1793311234&width=480",
        },
      ],
    },
    "https://alacamdagitim.com",
  );
  assert.equal(
    result.productModelUrl,
    "https://alacamdagitim.com/cdn/shop/files/cup.glb?v=7",
  );
  assert.equal(
    result.productDielineUrl,
    "https://alacamdagitim.com/cdn/shop/files/cut.svg?v=8",
  );
  assert.equal(
    result.productMockupImages[0].imageUrl,
    "/cdn/shop/files/base.png",
  );
  for (const value of [
    "files/../../cut.svg",
    "files/\\evil.com/cut.svg",
    "../files/cut.svg",
  ])
    assert.throws(
      () =>
        validateLaunchConfig(
          { ...config, productDielineUrl: value },
          "https://alacamdagitim.com",
        ),
      /güvenli bir dosya/,
    );
});

test("launcher accepts the public versioned mockup catalog and rejects malformed scene metadata", () => {
  const productMockupScenes = { schemaVersion: 1, scenes: [] };
  assert.deepEqual(
    validateLaunchConfig({ ...config, productMockupScenes })
      .productMockupScenes,
    productMockupScenes,
  );
  assert.equal(validateLaunchConfig(config).productMockupScenes, undefined);
  for (const value of [
    { scenes: [] },
    { schemaVersion: 2, scenes: [] },
    ["photo.jpg"],
  ])
    assert.throws(
      () => validateLaunchConfig({ ...config, productMockupScenes: value }),
      /mockup sahneleri geçersiz/,
    );
});

test("optional PSD catalog service survives the launcher without exposing admin credentials", () => {
  assert.equal(
    validateLaunchConfig({
      ...config,
      mockupApiBase: "https://mockup.example.com/",
    }).mockupApiBase,
    "https://mockup.example.com",
  );
  assert.equal(validateLaunchConfig(config).mockupApiBase, undefined);
  for (const mockupApiBase of [
    "javascript:alert(1)",
    "https://user:secret@example.com",
    "https://example.com?token=secret",
    "http://external.example.com",
  ])
    assert.throws(() => validateLaunchConfig({ ...config, mockupApiBase }));
});
