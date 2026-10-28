import test from "node:test";
import assert from "node:assert/strict";
import {
  previewBuffer,
  renderTextureSize,
  artworkMultiplier,
} from "../shared/render-quality.mjs";

test("retina previews stay crisp without exceeding the device pixel budget", () => {
  assert.deepEqual(previewBuffer(280, 280, 3, true), {
    width: 560,
    height: 560,
  });
  for (const mobile of [true, false])
    for (const detail of [true, false]) {
      const size = previewBuffer(3840, 2160, 3, mobile, detail);
      assert.ok(
        size.width * size.height <=
          (mobile ? 1_500_000 : detail ? 5_000_000 : 3_000_000),
      );
      assert.ok(Math.abs(size.width / size.height - 3840 / 2160) < 0.002);
    }
});
test("2K output retains a 2K artwork atlas even at standard sample quality", () => {
  assert.equal(renderTextureSize(2048), 2048);
  assert.equal(renderTextureSize(4096, true), 2048);
  assert.equal(artworkMultiplier(1200, 364, 2048), 2048 / 1200);
  assert.equal(artworkMultiplier(600, 900, 2048), 2048 / 900);
  assert.equal(artworkMultiplier(10, 10, 2048), 4);
});
