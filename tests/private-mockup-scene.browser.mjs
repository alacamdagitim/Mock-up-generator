// Opt-in browser verification of a privately prepared scene. No source pixels
// are embedded in this script or copied to public/, dist/ or the Git index.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPrivateMockupServer } from "../scripts/serve-private-mockup.mjs";

const assets = process.env.ALACAM_PRIVATE_MOCKUP_ASSETS;
const artwork = process.env.ALACAM_PRIVATE_MOCKUP_ARTWORK;
if (!assets || !artwork)
  throw new Error(
    "ALACAM_PRIVATE_MOCKUP_ASSETS ve ALACAM_PRIVATE_MOCKUP_ARTWORK gerekli.",
  );
const output = resolve(
  process.env.ALACAM_PRIVATE_MOCKUP_OUTPUT || "test-results/private-scene",
);
await mkdir(output, { recursive: true });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
let local, browser;
try {
  local = await createPrivateMockupServer({ assets, artwork });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  const errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().startsWith("http") && !r.url().startsWith(local.url))
      external.push(r.url());
  });
  await page.goto(local.url);
  await page.waitForFunction(
    () => window.privateMockup?.ready || window.privateMockup?.error,
    null,
    { timeout: 120000 },
  );
  assert.equal(await page.evaluate(() => window.privateMockup.error), "");
  assert.deepEqual(
    await page.evaluate(() => [
      window.privateMockup.width,
      window.privateMockup.height,
    ]),
    [local.manifest.width, local.manifest.height],
  );
  const initial = await page.evaluate(() =>
    window.privateMockup.export("image/png"),
  );
  const initialBytes = Buffer.from(initial.split(",")[1], "base64");
  await writeFile(resolve(output, "artwork-proof.png"), initialBytes);
  await page.screenshot({
    path: resolve(output, "desktop.png"),
    fullPage: true,
  });
  const pngPending = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG indir", exact: true }).click();
  const pngBytes = await readFile(await (await pngPending).path());
  assert.equal(pngBytes.readUInt32BE(16), local.manifest.width);
  assert.equal(pngBytes.readUInt32BE(20), local.manifest.height);
  assert.equal(hash(pngBytes), hash(initialBytes));
  const jpegPending = page.waitForEvent("download");
  await page.getByRole("button", { name: "JPG indir", exact: true }).click();
  const jpgBytes = await readFile(await (await jpegPending).path());
  assert.equal(jpgBytes[0], 0xff);
  assert.equal(jpgBytes[1], 0xd8);
  await writeFile(resolve(output, "artwork-proof.jpg"), jpgBytes);
  const jpgDimensions = await page.evaluate(
    async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return [image.width, image.height];
    },
    `data:image/jpeg;base64,${jpgBytes.toString("base64")}`,
  );
  assert.deepEqual(jpgDimensions, [
    local.manifest.width,
    local.manifest.height,
  ]);
  // A vivid replacement reveals incorrect masks and verifies the photo remains
  // byte-for-byte unchanged wherever the prepared coverage is zero.
  const replacement = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    x.fillStyle = "#15c65e";
    x.fillRect(0, 0, 64, 64);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Tasarım görseli seç").setInputFiles({
    name: "mask-check.png",
    mimeType: "image/png",
    buffer: Buffer.from(replacement, "base64"),
  });
  await page.waitForFunction(
    () => window.privateMockup.ready && window.privateMockup.renders === 2,
    null,
    { timeout: 120000 },
  );
  const replacementUrl = await page.evaluate(() =>
    window.privateMockup.export("image/png"),
  );
  assert.notEqual(
    hash(Buffer.from(replacementUrl.split(",")[1], "base64")),
    hash(initialBytes),
  );
  const maskCheck = await page.evaluate(async () => {
    const config = await fetch("/config.json").then((r) => r.json());
    const output = document.querySelector("#stage canvas"),
      ctx = output.getContext("2d");
    const load = async (name) => {
      const image = new Image();
      image.src = "/assets/" + encodeURIComponent(name);
      await image.decode();
      const c = document.createElement("canvas");
      c.width = output.width;
      c.height = output.height;
      const x = c.getContext("2d");
      x.drawImage(image, 0, 0);
      return x.getImageData(0, 0, c.width, c.height).data;
    };
    const base = await load(config.manifest.base),
      mask = await load(config.manifest.lookup.coverage),
      pixels = ctx.getImageData(0, 0, output.width, output.height).data;
    let untouched = 0,
      changedOutside = 0,
      covered = 0,
      changedInside = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const equal =
        pixels[i] === base[i] &&
        pixels[i + 1] === base[i + 1] &&
        pixels[i + 2] === base[i + 2] &&
        pixels[i + 3] === base[i + 3];
      if (mask[i] === 0 || mask[i + 3] === 0) {
        untouched++;
        if (!equal) changedOutside++;
      } else if (mask[i] > 250 && mask[i + 3] > 250) {
        covered++;
        if (!equal) changedInside++;
      }
    }
    return { untouched, changedOutside, covered, changedInside };
  });
  assert.ok(maskCheck.untouched > 0);
  assert.equal(maskCheck.changedOutside, 0);
  assert.ok(maskCheck.covered > 0);
  assert.ok(maskCheck.changedInside > maskCheck.covered * 0.9);
  await page.getByLabel("Tasarım görseli seç").setInputFiles(artwork);
  await page.waitForFunction(
    () => window.privateMockup.ready && window.privateMockup.renders === 3,
    null,
    { timeout: 120000 },
  );
  assert.equal(
    await page.evaluate(() => window.privateMockup.export("image/png")),
    initial,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({
    viewport: innerWidth,
    body: document.body.scrollWidth,
    width: document.querySelector("canvas").width,
    height: document.querySelector("canvas").height,
  }));
  assert.ok(mobile.body <= mobile.viewport);
  assert.equal(mobile.width, local.manifest.width);
  assert.equal(mobile.height, local.manifest.height);
  await page.screenshot({
    path: resolve(output, "mobile.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const report = {
    passed: 8,
    dimensions: [local.manifest.width, local.manifest.height],
    checks: [
      "native scene dimensions",
      "PNG exact download",
      "JPG native download",
      "artwork replacement",
      "zero-coverage photo pixels preserved",
      "covered surface changed",
      "deterministic artwork restore",
      "mobile layout",
    ],
    maskCheck,
    externalRequests: external.length,
    browserErrors: errors,
    sourceFilesPublished: 0,
    artworkProofSha256: hash(initialBytes),
    servedFiles: local.files,
  };
  await writeFile(
    resolve(output, "qa.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await local?.close();
}
