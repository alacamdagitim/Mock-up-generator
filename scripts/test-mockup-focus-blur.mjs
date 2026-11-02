import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { transform } from "esbuild";
import { mockupSurfaceSchema } from "../shared/mockup-scenes.mjs";

const code = await readFile(
  new URL("../src/mockups/focus-blur.ts", import.meta.url),
  "utf8",
);
const compiled = await transform(code, {
  loader: "ts",
  format: "esm",
  target: "es2022",
});
const { blurMockupLayer } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled.code).toString("base64")
);

test("blur spreads coverage symmetrically without bleeding hidden RGB or dark halos", async () => {
  const w = 31,
    h = 31,
    data = new Uint8ClampedArray(w * h * 4);
  // Transparent green pixels must contribute no green to the opaque red mark.
  for (let i = 0; i < data.length; i += 4) data[i + 1] = 255;
  const at = (x, y) => (y * w + x) * 4;
  data.set([220, 20, 0, 255], at(15, 15));
  await blurMockupLayer(data, w, h, 2);
  const center = data[at(15, 15) + 3];
  assert.ok(center > 0 && center < 255);
  for (let d = 0; d <= 6; d++) {
    assert.equal(data[at(15 - d, 15) + 3], data[at(15 + d, 15) + 3]);
    assert.equal(data[at(15, 15 - d) + 3], data[at(15, 15 + d) + 3]);
  }
  let alphaSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    alphaSum += data[i + 3];
    if (data[i + 3]) assert.deepEqual([...data.slice(i, i + 3)], [220, 20, 0]);
  }
  // Quantization affects a low-alpha impulse; it must still retain its coverage.
  assert.ok(alphaSum > 220 && alphaSum <= 260, alphaSum);
});

test("solid color stays solid at a softened opaque edge, including the image boundary", async () => {
  const w = 24,
    h = 24,
    data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < 18; y++)
    for (let x = 0; x < 12; x++) data.set([255, 210, 0, 255], (y * w + x) * 4);
  await blurMockupLayer(data, w, h, 2.2);
  assert.ok(
    data[(10 * w + 13) * 4 + 3] > 0,
    "coverage extends beyond the original edge",
  );
  for (let i = 0; i < data.length; i += 4)
    if (data[i + 3]) assert.deepEqual([...data.slice(i, i + 3)], [255, 210, 0]);
});

test("zero blur preserves every byte and cancellation stops before modifying the layer", async () => {
  const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);
  const original = data.slice();
  await blurMockupLayer(data, 2, 1, 0);
  assert.deepEqual(data, original);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(blurMockupLayer(data, 2, 1, 2, abort.signal), {
    name: "AbortError",
  });
  assert.deepEqual(data, original);
});

test("a cropped opaque surface retains coverage at every canvas border", async () => {
  const w = 31,
    h = 31,
    data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set([255, 210, 0, 255], i);
  await blurMockupLayer(data, w, h, 2.2);
  for (let i = 0; i < data.length; i += 4)
    assert.deepEqual([...data.slice(i, i + 4)], [255, 210, 0, 255]);
});

test("focus blur is bounded and optional so existing product catalogs remain valid", () => {
  const surface = {
    id: "paper",
    face: "front",
    mapping: {
      type: "quad",
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    },
  };
  assert.ok(mockupSurfaceSchema.safeParse(surface).success);
  assert.equal(
    mockupSurfaceSchema.parse({ ...surface, focusBlur: 3 }).focusBlur,
    3,
  );
  for (const value of [-1, 8.01, Infinity, NaN])
    assert.equal(
      mockupSurfaceSchema.safeParse({ ...surface, focusBlur: value }).success,
      false,
    );
});
