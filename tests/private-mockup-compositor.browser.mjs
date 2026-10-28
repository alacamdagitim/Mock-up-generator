// Real browser/compositor checks using entirely original synthetic fixtures.
// No licensed PSD, layer or model file is included in this test or repository.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { createPrivateMockupSession } from "../scripts/private-mockup-preview.mjs";

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++)
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function rgbaPng(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      pixel(x, y).forEach((channel, index) => {
        raw[y * (width * 4 + 1) + 1 + x * 4 + index] = channel;
      });
  function chunk(type, bytes) {
    const label = Buffer.from(type);
    const result = Buffer.alloc(12 + bytes.length);
    result.writeUInt32BE(bytes.length);
    label.copy(result, 4);
    bytes.copy(result, 8);
    result.writeUInt32BE(
      crc32(Buffer.concat([label, bytes])),
      8 + bytes.length,
    );
    return result;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function close(actual, expected, tolerance = 1) {
  assert.equal(actual.length, expected.length);
  expected.forEach((value, index) => {
    assert.ok(
      Math.abs(actual[index] - value) <= tolerance,
      `${actual} should be within ${tolerance} of ${expected}`,
    );
  });
}

const folder = await mkdtemp(
  resolve(tmpdir(), "alacam-private-compositor-test-"),
);
let session;
try {
  const assets = resolve(folder, "assets");
  await mkdir(assets);
  await writeFile(
    resolve(assets, "base.png"),
    rgbaPng(4, 4, () => [20, 40, 80, 255]),
  );
  await writeFile(
    resolve(assets, "coverage.png"),
    rgbaPng(4, 4, (x, y) => {
      const index = y * 4 + x;
      return index === 0
        ? [0, 0, 0, 255]
        : index === 2
          ? [128, 128, 128, 255]
          : index === 3
            ? [255, 255, 255, 128]
            : [255, 255, 255, 255];
    }),
  );
  const lookup = Buffer.alloc(4 * 4 * 4);
  for (let index = 0; index < 16; index++) {
    const corners = [
      [0, 0],
      [65535, 0],
      [0, 65535],
      [65535, 65535],
    ];
    const uv = index >= 4 && index <= 7 ? corners[index - 4] : [32768, 32768];
    lookup.writeUInt16LE(uv[0], index * 4);
    lookup.writeUInt16LE(uv[1], index * 4 + 2);
  }
  await writeFile(resolve(assets, "uv.bin"), lookup);
  await writeFile(resolve(assets, "bad-uv.bin"), Buffer.alloc(4));
  await writeFile(
    resolve(assets, "effect.png"),
    rgbaPng(4, 4, () => [80, 160, 220, 255]),
  );
  const artwork = resolve(folder, "corners.png");
  const colors = [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [255, 255, 255, 255],
  ];
  await writeFile(
    artwork,
    rgbaPng(2, 2, (x, y) => colors[y * 2 + x]),
  );
  await writeFile(
    resolve(assets, "transparent-artwork.png"),
    rgbaPng(2, 2, (x, y) =>
      x === 0 && y === 0 ? [255, 0, 0, 255] : [0, 0, 0, 0],
    ),
  );
  await writeFile(
    resolve(assets, "constant-artwork.png"),
    rgbaPng(2, 2, () => [180, 120, 60, 255]),
  );
  await writeFile(
    resolve(assets, "wide-artwork.png"),
    rgbaPng(4, 2, () => [40, 190, 80, 255]),
  );
  const manifest = {
    schemaVersion: 1,
    name: "Original synthetic test",
    width: 4,
    height: 4,
    sourceWidth: 2,
    sourceHeight: 2,
    base: "base.png",
    lookup: { file: "uv.bin", format: "rg16le", coverage: "coverage.png" },
  };
  await writeFile(resolve(assets, "manifest.json"), JSON.stringify(manifest));
  session = await createPrivateMockupSession({ assets, artwork });
  const { page } = session;
  const initial = await page.evaluate(() => {
    const context = document.querySelector("#stage canvas").getContext("2d");
    return Array.from({ length: 8 }, (_, index) => [
      ...context.getImageData(index % 4, Math.floor(index / 4), 1, 1).data,
    ]);
  });
  close(initial[0], [20, 40, 80, 255], 0);
  close(initial[1], [128, 128, 128, 255]);
  close(initial[2], [74, 84, 104, 255]);
  close(initial[3], [74, 84, 104, 255]);
  colors.forEach((color, index) => close(initial[index + 4], color, 0));

  const run = (changes, artworkFile = "constant-artwork.png", maxEdge) =>
    page.evaluate(
      async ({ changes, artworkFile, maxEdge }) => {
        const { composeMockup } = await import("/compositor.mjs");
        const config = await fetch("/config.json").then((response) =>
          response.json(),
        );
        const artwork = new Image();
        artwork.src = "/assets/" + encodeURIComponent(artworkFile);
        await artwork.decode();
        const canvas = await composeMockup({
          manifest: { ...config.manifest, ...changes },
          artwork,
          maxEdge,
          assetUrl: (path) => "/assets/" + encodeURIComponent(path),
        });
        const context = canvas.getContext("2d");
        return {
          width: canvas.width,
          height: canvas.height,
          pixel: [
            ...context.getImageData(Math.min(1, canvas.width - 1), 0, 1, 1)
              .data,
          ],
          pixels: [
            ...context.getImageData(0, 0, canvas.width, canvas.height).data,
          ],
        };
      },
      { changes, artworkFile, maxEdge },
    );

  const alpha = await run({}, "transparent-artwork.png");
  close(alpha.pixel, [79, 30, 60, 255], 1);
  const blends = [
    ["normal", 0.5, [130, 140, 140, 255]],
    ["multiply", 1, [56, 75, 52, 255]],
    ["screen", 1, [204, 205, 228, 255]],
    ["linear-burn", 1, [5, 25, 25, 255]],
  ];
  for (const [blend, opacity, expected] of blends) {
    const result = await run({
      layers: [{ file: "effect.png", blend, opacity }],
    });
    close(result.pixel, expected, 1);
    close(result.pixels.slice(0, 4), [20, 40, 80, 255], 0);
  }
  const noUpscale = await run({}, "constant-artwork.png", 128);
  assert.equal(noUpscale.width, 4);
  assert.equal(noUpscale.height, 4);
  const reduced = await run({}, "constant-artwork.png", 2);
  assert.equal(reduced.width, 2);
  assert.equal(reduced.height, 2);
  const contained = await run(
    { sourceWidth: 4, sourceHeight: 4 },
    "wide-artwork.png",
  );
  close(contained.pixels.slice(4 * 4, 4 * 5), [20, 40, 80, 255]);
  close(contained.pixel, [40, 190, 80, 255]);

  await assert.rejects(
    () => run({ lookup: { ...manifest.lookup, file: "bad-uv.bin" } }),
    /ölçüleri/,
  );
  await assert.rejects(
    () => run({ width: 12000, height: 12000 }),
    /piksel bütçesini/,
  );
  await assert.rejects(
    () => run({ layers: [{ file: "effect.png", blend: "unsupported" }] }),
    /Desteklenmeyen/,
  );
  const aborted = await page.evaluate(async () => {
    const { composeMockup } = await import("/compositor.mjs");
    const controller = new AbortController();
    controller.abort();
    try {
      await composeMockup({ signal: controller.signal });
    } catch (error) {
      return error.name;
    }
    return "not-aborted";
  });
  assert.equal(aborted, "AbortError");
  assert.equal(session.pageErrors.length, 0);
  assert.equal(session.blockedRequests.length, 0);
  console.log(
    JSON.stringify(
      {
        passed: 10,
        checks: [
          "RG16 little-endian corners",
          "bilinear midpoint",
          "grayscale and alpha coverage",
          "premultiplied logo edges",
          "clipped blend passes",
          "no upscaling",
          "native downscaling",
          "contained artwork",
          "malformed manifest and lookup rejection",
          "cancellation",
        ],
        browserErrors: session.pageErrors,
        externalRequests: session.blockedRequests.length,
      },
      null,
      2,
    ),
  );
} finally {
  await session?.context.close().catch(() => {});
  await session?.browser.close().catch(() => {});
  await rm(folder, { recursive: true, force: true });
}
