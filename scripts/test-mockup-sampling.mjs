import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { transform } from "esbuild";

const source = await readFile(
  new URL("../src/mockups/sampling.ts", import.meta.url),
  "utf8",
);
const compiled = await transform(source, {
  loader: "ts",
  format: "esm",
  target: "es2022",
});
const { chooseUvDerivative, sampleAnisotropic, sampleMinified } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled.code).toString("base64")
);
const out = new Float64Array(4),
  scratch = new Float64Array(4),
  tap = new Float64Array(4);

function levelsFor(width, height, color) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(color(x, y), (y * width + x) * 4);
  const levels = [{ data, width, height }];
  while (width > 1 || height > 1) {
    const previous = levels.at(-1),
      w = Math.max(1, Math.ceil(width / 2)),
      h = Math.max(1, Math.ceil(height / 2));
    const next = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let alpha = 0,
          r = 0,
          g = 0,
          b = 0,
          n = 0;
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const sx = x * 2 + dx,
              sy = y * 2 + dy;
            if (sx >= width || sy >= height) continue;
            const i = (sy * width + sx) * 4,
              a = previous.data[i + 3];
            n++;
            alpha += a;
            r += previous.data[i] * a;
            g += previous.data[i + 1] * a;
            b += previous.data[i + 2] * a;
          }
        next.set(
          [
            alpha ? r / alpha : 0,
            alpha ? g / alpha : 0,
            alpha ? b / alpha : 0,
            alpha / n,
          ],
          (y * w + x) * 4,
        );
      }
    levels.push({ data: next, width: w, height: h });
    width = w;
    height = h;
  }
  return levels;
}

test("an oblique footprint preserves fine detail perpendicular to minification", () => {
  const levels = levelsFor(256, 64, (_, y) =>
    Math.floor(y / 4) % 2 ? [0, 0, 255, 255] : [255, 0, 0, 255],
  );
  const u = 0.5,
    v = 25 / 63;
  sampleMinified(levels, u, v, 8, out, scratch);
  assert.ok(
    out[2] > 80,
    "isotropic reference visibly loses the horizontal stripe",
  );
  sampleAnisotropic(levels, u, v, 8 / 256, 0, 0, 1 / 64, out, scratch, tap);
  assert.ok(
    out[0] > 240 && out[2] < 15,
    "the uncompressed direction retains the red stripe",
  );
});

test("anisotropic minification still averages detail along the compressed direction", () => {
  const levels = levelsFor(256, 64, (x) =>
    x % 2 ? [0, 0, 0, 255] : [255, 255, 255, 255],
  );
  sampleAnisotropic(levels, 0.5, 0.5, 8 / 256, 0, 0, 1 / 64, out, scratch, tap);
  assert.ok(out[0] > 115 && out[0] < 140, out[0]);
  assert.equal(out[3], 255);
});

test("rotating the compressed axis preserves the other direction", () => {
  const levels = levelsFor(64, 256, (x) =>
    Math.floor(x / 4) % 2 ? [0, 0, 255, 255] : [255, 0, 0, 255],
  );
  sampleAnisotropic(
    levels,
    25 / 63,
    0.5,
    1 / 64,
    0,
    0,
    8 / 256,
    out,
    scratch,
    tap,
  );
  assert.ok(out[0] > 240 && out[2] < 15);
});

test("an almost isotropic native pixel does not get an extra smoothing pass", () => {
  const levels = levelsFor(64, 64, (x) =>
    x === 25 ? [255, 0, 0, 255] : [0, 0, 0, 255],
  );
  sampleAnisotropic(
    levels,
    25 / 63,
    25 / 63,
    1.01 / 64,
    0,
    0,
    1 / 64,
    out,
    scratch,
    tap,
  );
  assert.ok(out[0] > 250, out[0]);
});

test("transparent logo edges retain their color during multiple taps", () => {
  const levels = levelsFor(64, 16, (x) =>
    x < 32 ? [220, 20, 0, 255] : [0, 0, 255, 0],
  );
  sampleAnisotropic(levels, 0.5, 0.5, 8 / 64, 0, 0, 1 / 16, out, scratch, tap);
  assert.ok(out[3] > 80 && out[3] < 180);
  assert.ok(
    Math.abs(out[0] - 220) < 1 && Math.abs(out[1] - 20) < 1 && out[2] < 1,
  );
});

test("UV derivatives reject an adjacent cup seam without rejecting real minification", () => {
  const result = new Float64Array(2);
  chooseUvDerivative(0.2, 0.12, 0.001, 0.002, 1800, 900, result);
  assert.deepEqual([...result], [0.001, 0.002]);
  chooseUvDerivative(0.3, 0.02, NaN, NaN, 1800, 900, result);
  assert.deepEqual([...result], [0.3, 0.02]);
  chooseUvDerivative(0, 0, 0.001, 0.002, 1800, 900, result);
  assert.deepEqual([...result], [0.001, 0.002]);
  chooseUvDerivative(NaN, NaN, NaN, NaN, 1800, 900, result);
  assert.deepEqual([...result], [0, 0]);
});
