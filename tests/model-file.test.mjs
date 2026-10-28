import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inspectGlb } from "../shared/model-file.mjs";
import { blankDesign, parseDesign, effectiveDpi } from "../shared/schema.mjs";
const glb = (json) => {
  const text = Buffer.from(JSON.stringify(json));
  const length = Math.ceil(text.length / 4) * 4;
  const buffer = new ArrayBuffer(20 + length);
  const view = new DataView(buffer);
  for (const [offset, value] of [
    [0, 0x46546c67],
    [4, 2],
    [8, buffer.byteLength],
    [12, length],
    [16, 0x4e4f534a],
  ])
    view.setUint32(offset, value, true);
  new Uint8Array(buffer, 20).fill(32);
  new Uint8Array(buffer, 20).set(text);
  return buffer;
};
test("GLB inspection accepts the original embedded asset and rejects remote dependencies before parsing", async () => {
  const reference = await readFile(
    "public/product-assets/doypack-v1-r1/model.glb",
  );
  assert.equal(
    inspectGlb(
      reference.buffer.slice(
        reference.byteOffset,
        reference.byteOffset + reference.byteLength,
      ),
    ).asset.version,
    "2.0",
  );
  for (const json of [
    { images: [{ uri: "https://remote.example/tracker.png" }] },
    { buffers: [{ uri: "geometry.bin" }] },
    { accessors: [{ count: 3000001 }] },
    { nodes: Array(2001).fill({}) },
  ])
    assert.throws(() => inspectGlb(glb(json)));
  assert.throws(() => inspectGlb(new ArrayBuffer(5)));
  const invalid = glb({ asset: { version: "2.0" } });
  new DataView(invalid).setUint32(8, 12, true);
  assert.throws(() => inspectGlb(invalid));
});
test("product artboard dimensions survive JSON and drive DPI without a doypack size assumption", () => {
  const artboard = {
    canvasWidth: 1200,
    canvasHeight: 364,
    widthMm: 198,
    heightMm: 60,
    sourceUrl: "https://cdn.shopify.com/files/cut.svg?v=1",
  };
  assert.deepEqual(
    parseDesign(JSON.parse(JSON.stringify({ ...blankDesign(), artboard })))
      .artboard,
    artboard,
  );
  const image = {
    kind: "image",
    pixelWidth: 1200,
    pixelHeight: 364,
    width: 1200,
    height: 364,
    scaleX: 1,
    scaleY: 1,
  };
  assert.equal(effectiveDpi(image, artboard), 154);
  assert.equal(
    effectiveDpi(image, { canvasWidth: 1200, canvasHeight: 364 }),
    null,
  );
  for (const invalid of [
    { ...artboard, canvasWidth: 50000 },
    { ...artboard, widthMm: -1 },
    { ...artboard, sourceUrl: "javascript:alert(1)" },
  ])
    assert.throws(() => parseDesign({ ...blankDesign(), artboard: invalid }));
  assert.equal(parseDesign(blankDesign()).artboard, undefined);
});
