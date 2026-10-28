// Exercises only the local preview shell and its private file transport.
// Real Photoshop/UV compositor quality is checked separately on the user's
// private fixture; this test uses small, original synthetic images.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
function png(rgb) {
  const width = 2;
  const height = 2;
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      rgb.forEach((channel, index) => {
        pixels[y * 7 + 1 + x * 3 + index] = channel;
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
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const folder = await mkdtemp(resolve(tmpdir(), "alacam-private-preview-test-"));
let session;
try {
  const assets = resolve(folder, "assets");
  await mkdir(assets);
  await writeFile(
    resolve(assets, "manifest.json"),
    JSON.stringify({ base: "base.png" }),
  );
  await writeFile(resolve(assets, "base.png"), png([40, 80, 180]));
  await writeFile(
    resolve(assets, "uv-rg16.bin"),
    Buffer.from([0, 128, 255, 255]),
  );
  const artwork = resolve(folder, "first-artwork.png");
  const replacement = resolve(folder, "replacement.png");
  await writeFile(artwork, png([40, 190, 80]));
  await writeFile(replacement, png([210, 45, 55]));
  const compositor = resolve(folder, "synthetic-compositor.mjs");
  await writeFile(
    compositor,
    `
    export async function composeMockup({manifest, assetUrl, artwork}) {
      const base = new Image();
      base.src = assetUrl(manifest.base);
      await base.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 48;
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = false;
      context.drawImage(base, 0, 0, 64, 48);
      context.drawImage(artwork, 8, 8, 32, 32);
      return canvas;
    }
  `,
  );
  session = await createPrivateMockupSession({ assets, artwork, compositor });
  const { page } = session;
  assert.deepEqual(session.state, {
    ready: true,
    error: "",
    width: 64,
    height: 48,
  });
  assert.deepEqual([...session.servedAssets], ["base.png"]);
  const pixel = () =>
    page.evaluate(() => {
      const canvas = document.querySelector("#stage canvas");
      const data = canvas.getContext("2d").getImageData(16, 16, 1, 1).data;
      return [...data];
    });
  assert.deepEqual(await pixel(), [40, 190, 80, 255]);

  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG indir", exact: true }).click();
  const downloadedPng = await pngDownload;
  assert.equal(downloadedPng.suggestedFilename(), "first-artwork-mockup.png");
  const pngBytes = await readFile(await downloadedPng.path());
  assert.equal(pngBytes.readUInt32BE(16), 64);
  assert.equal(pngBytes.readUInt32BE(20), 48);

  const jpgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "JPG indir", exact: true }).click();
  const downloadedJpg = await jpgDownload;
  const jpgBytes = await readFile(await downloadedJpg.path());
  assert.equal(jpgBytes[0], 0xff);
  assert.equal(jpgBytes[1], 0xd8);
  assert.ok(downloadedJpg.suggestedFilename().endsWith(".jpg"));

  await page.getByLabel("Tasarım görseli seç").setInputFiles(replacement);
  await page.waitForFunction(
    () => window.privateMockup.ready && window.privateMockup.renders === 2,
  );
  assert.deepEqual(await pixel(), [210, 45, 55, 255]);
  const exported = await page.evaluate(async () => {
    const image = new Image();
    image.src = window.privateMockup.export("image/jpeg");
    await image.decode();
    return { width: image.width, height: image.height };
  });
  assert.deepEqual(exported, { width: 64, height: 48 });
  const binary = await page.evaluate(async () => {
    const response = await fetch("/assets/uv-rg16.bin");
    return {
      status: response.status,
      bytes: [...new Uint8Array(await response.arrayBuffer())],
    };
  });
  assert.deepEqual(binary, { status: 200, bytes: [0, 128, 255, 255] });

  const denied = await page.evaluate(async () => {
    const escaped = await fetch(
      "/assets/" + encodeURIComponent("../first-artwork.png"),
    );
    const outside = await fetch("https://example.com/").then(
      () => false,
      () => true,
    );
    const write = await fetch("/config.json", { method: "POST" }).then(
      () => false,
      () => true,
    );
    return {
      escapedStatus: escaped.status,
      outsideBlocked: outside,
      writeBlocked: write,
    };
  });
  assert.deepEqual(denied, {
    escapedStatus: 404,
    outsideBlocked: true,
    writeBlocked: true,
  });
  // CSP can reject the external fetch before it reaches Playwright's route.
  assert.ok(session.blockedRequests.length >= 1);
  assert.equal(session.pageErrors.length, 0);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({
    viewport: innerWidth,
    body: document.body.scrollWidth,
    canvas: document.querySelector("canvas").getBoundingClientRect().toJSON(),
  }));
  assert.ok(mobile.body <= mobile.viewport);
  assert.ok(mobile.canvas.width <= mobile.viewport - 28);
  console.log(
    JSON.stringify(
      {
        passed: 8,
        checks: [
          "private image transport",
          "native PNG",
          "native JPG",
          "artwork replacement",
          "16-bit lookup byte transport",
          "path containment",
          "network and write denial",
          "mobile layout",
        ],
        dimensions: exported,
        browserErrors: session.pageErrors,
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
