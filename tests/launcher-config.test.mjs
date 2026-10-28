import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../src/launcherConfig.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
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
