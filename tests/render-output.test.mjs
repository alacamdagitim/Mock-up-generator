import test from "node:test";
import assert from "node:assert/strict";
import { outputDimensions, renderTiles } from "../shared/render-output.mjs";

test("real 1K/2K/4K/8K output dimensions retain aspect and cap mobile", () => {
  for (const edge of [1024, 2048, 4096, 8192]) {
    assert.deepEqual(outputDimensions(edge), { width: edge, height: edge });
    assert.deepEqual(outputDimensions(edge, "landscape"), {
      width: edge,
      height: edge * 0.75,
    });
    assert.deepEqual(outputDimensions(edge, "portrait"), {
      width: edge * 0.75,
      height: edge,
    });
    assert.deepEqual(outputDimensions(edge, "square", true), {
      width: 1024,
      height: 1024,
    });
  }
  assert.throws(() => outputDimensions(12000));
});

test("8K tile interiors cover every pixel exactly once; overlap bounds GPU buffers", () => {
  for (const { width, height } of [
    outputDimensions(8192),
    outputDimensions(4096, "portrait"),
  ]) {
    const tiles = renderTiles(width, height);
    assert.equal(
      tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0),
      width * height,
    );
    for (let i = 0; i < tiles.length; i++) {
      const a = tiles[i];
      assert.ok(a.renderWidth <= 1048 && a.renderHeight <= 1048);
      assert.ok(
        a.renderX >= 0 &&
          a.renderY >= 0 &&
          a.renderX + a.renderWidth <= width &&
          a.renderY + a.renderHeight <= height,
      );
      assert.ok(a.x >= a.renderX && a.x + a.width <= a.renderX + a.renderWidth);
      for (const b of tiles.slice(i + 1))
        assert.ok(
          !(
            a.x < b.x + b.width &&
            b.x < a.x + a.width &&
            a.y < b.y + b.height &&
            b.y < a.y + a.height
          ),
        );
    }
  }
});
