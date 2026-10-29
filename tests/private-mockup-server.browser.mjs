// Original synthetic data only. Source scene passes are never published.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { request } from "node:http";
import { createPrivateMockupServer } from "../scripts/serve-private-mockup.mjs";

function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      pixel(x, y).forEach((value, c) => {
        raw[y * (width * 4 + 1) + 1 + x * 4 + c] = value;
      });
  function chunk(name, bytes) {
    const payload = Buffer.concat([Buffer.from(name), bytes]);
    let crc = 0xffffffff;
    for (const byte of payload) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const out = Buffer.alloc(bytes.length + 12);
    out.writeUInt32BE(bytes.length);
    payload.copy(out, 4);
    out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
    return out;
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
const folder = await mkdtemp(resolve(tmpdir(), "alacam-local-scene-test-"));
let local, browser;
try {
  const assets = resolve(folder, "passes");
  await mkdir(assets);
  const width = 6,
    height = 4;
  await writeFile(
    resolve(assets, "base.png"),
    png(width, height, () => [20, 40, 80, 255]),
  );
  await writeFile(
    resolve(assets, "mask.png"),
    png(width, height, (x, y) => [
      x === 0 || (x === 2 && y === 2) ? 0 : 255,
      0,
      0,
      255,
    ]),
  );
  const uv = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      uv.writeUInt16LE(Math.round((x / (width - 1)) * 65535), i);
      uv.writeUInt16LE(Math.round((y / (height - 1)) * 65535), i + 2);
    }
  await writeFile(resolve(assets, "front.bin"), uv);
  await writeFile(resolve(assets, "not-listed.txt"), "private unlisted data");
  const manifest = {
    schemaVersion: 1,
    width,
    height,
    sourceWidth: 2,
    sourceHeight: 2,
    base: "base.png",
    lookup: { file: "front.bin", format: "rg16le", coverage: "mask.png" },
    approximate: true,
    notes: ["Özgün sentetik test sahnesi."],
  };
  await writeFile(resolve(assets, "manifest.json"), JSON.stringify(manifest));
  const artwork = resolve(folder, "green.png"),
    replacement = resolve(folder, "red.png");
  await writeFile(
    artwork,
    png(2, 2, () => [30, 190, 70, 255]),
  );
  await writeFile(
    replacement,
    png(2, 2, () => [200, 40, 55, 255]),
  );
  local = await createPrivateMockupServer({ assets, artwork });
  for (const [path, status, options] of [
    ["assets/not-listed.txt", 404],
    ["assets/manifest.json", 404],
    ["assets/..%2Fgreen.png", 404],
    ["config.json", 405, { method: "POST" }],
    ["config.json", 403, { headers: { Origin: "https://attacker.example" } }],
  ]) {
    assert.equal((await fetch(local.url + path, options)).status, status, path);
  }
  const rejectedHost = await new Promise((done, reject) => {
    const call = request(
      local.url,
      { headers: { host: "attacker.example" } },
      (response) => {
        response.resume();
        done(response.statusCode);
      },
    );
    call.on("error", reject);
    call.end();
  });
  assert.equal(rejectedHost, 403);
  const response = await fetch(local.url);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(
    response.headers.get("content-security-policy"),
    /connect-src 'self'/,
  );
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(local.url);
  await page.waitForFunction(
    () => window.privateMockup?.ready || window.privateMockup?.error,
  );
  assert.equal(await page.evaluate(() => window.privateMockup.error), "");
  const pixel = (x, y) =>
    page.evaluate(
      ({ x, y }) => [
        ...document
          .querySelector("#stage canvas")
          .getContext("2d")
          .getImageData(x, y, 1, 1).data,
      ],
      { x, y },
    );
  assert.deepEqual(await pixel(1, 1), [30, 190, 70, 255]);
  assert.deepEqual(await pixel(2, 2), [20, 40, 80, 255]);
  const initial = await page.evaluate(() =>
    window.privateMockup.export("image/png"),
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG indir", exact: true }).click();
  const bytes = await readFile(await (await pending).path());
  assert.equal(bytes.readUInt32BE(16), width);
  assert.equal(bytes.readUInt32BE(20), height);
  assert.equal(bytes.toString("base64"), initial.split(",")[1]);
  await page.getByLabel("Tasarım görseli seç").setInputFiles(replacement);
  await page.waitForFunction(
    () => window.privateMockup.ready && window.privateMockup.renders === 2,
  );
  assert.deepEqual(await pixel(1, 1), [200, 40, 55, 255]);
  assert.deepEqual(await pixel(2, 2), [20, 40, 80, 255]);
  await page.getByLabel("Tasarım görseli seç").setInputFiles(artwork);
  await page.waitForFunction(
    () => window.privateMockup.ready && window.privateMockup.renders === 3,
  );
  assert.equal(
    await page.evaluate(() => window.privateMockup.export("image/png")),
    initial,
  );
  const jpg = await page.evaluate(async () => {
    const image = new Image();
    image.src = window.privateMockup.export("image/jpeg");
    await image.decode();
    return [image.width, image.height];
  });
  assert.deepEqual(jpg, [width, height]);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: 10,
        checks: [
          "loopback host and origin guard",
          "read-only transport",
          "manifest-only source allowlist",
          "source path containment",
          "real RG16 composition",
          "foreground mask preserved",
          "native PNG and JPG",
          "upload replacement",
          "deterministic restoration",
          "mobile layout",
        ],
        browserErrors: errors,
        sourceFilesPublished: 0,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await local?.close();
  await rm(folder, { recursive: true, force: true });
}
