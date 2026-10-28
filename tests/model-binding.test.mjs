import test from "node:test";
import assert from "node:assert/strict";
import { blankDesign, parseDesign } from "../shared/schema.mjs";

const binding = {
  modelUrl: "https://cdn.shopify.com/files/product.glb?v=2",
  targetId: "0/1/2:0",
  flipY: false,
};

test("model binding round trips strictly in versioned JSON without breaking legacy designs", () => {
  const legacy = blankDesign();
  assert.equal(parseDesign(legacy).modelBinding, undefined);
  const design = { ...legacy, modelBinding: binding };
  assert.deepEqual(
    parseDesign(JSON.parse(JSON.stringify(design))).modelBinding,
    binding,
  );
  assert.deepEqual(
    parseDesign({
      ...design,
      modelBinding: { ...binding, targetId: "root:0", flipY: true },
    }).modelBinding,
    { ...binding, targetId: "root:0", flipY: true },
  );
});

test("model binding rejects unsafe URLs, credentials, oversized URLs and extra properties", () => {
  for (const modelUrl of [
    "javascript:alert(1)",
    "data:model/gltf-binary,abc",
    "blob:https://example.com/123",
    "http://example.com/product.glb",
    "https://user:secret@example.com/product.glb",
    "//cdn.shopify.com/model.glb",
    `https://example.com/${"a".repeat(2100)}`,
  ])
    assert.throws(
      () =>
        parseDesign({
          ...blankDesign(),
          modelBinding: { ...binding, modelUrl },
        }),
      modelUrl.slice(0, 80),
    );
  assert.throws(() =>
    parseDesign({
      ...blankDesign(),
      modelBinding: { ...binding, arbitraryMesh: true },
    }),
  );
});

test("target IDs accept stable child paths and reject names, UUIDs and malformed paths", () => {
  for (const targetId of ["0:0", "0/10/2:3", "root:0"])
    assert.equal(
      parseDesign({ ...blankDesign(), modelBinding: { ...binding, targetId } })
        .modelBinding.targetId,
      targetId,
    );
  for (const targetId of [
    "",
    "贴图",
    "mesh-uuid",
    "../mesh:0",
    "0//1:0",
    "0:-1",
    "root/0:0",
    "0:0:0",
    "0:0\n",
    "root:0\r\n",
    `0/${"1/".repeat(300)}1:0`,
  ])
    assert.throws(
      () =>
        parseDesign({
          ...blankDesign(),
          modelBinding: { ...binding, targetId },
        }),
      targetId.slice(0, 80),
    );
});

test("binding orientation is a required boolean; invalid bindings never silently coerce", () => {
  for (const flipY of [undefined, null, 0, 1, "false", "true"])
    assert.throws(() =>
      parseDesign({ ...blankDesign(), modelBinding: { ...binding, flipY } }),
    );
  assert.throws(() => parseDesign({ ...blankDesign(), modelBinding: null }));
});
