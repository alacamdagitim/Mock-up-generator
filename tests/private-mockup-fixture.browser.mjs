// Opt-in QA against private local assets. No PSD, layer, UV map or artwork is
// copied into the repository; only flattened images/screenshots go to /tmp.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createPrivateMockupSession } from "../scripts/private-mockup-preview.mjs";

const assets = process.env.ALACAM_PRIVATE_MOCKUP_ASSETS;
const artwork = process.env.ALACAM_PRIVATE_MOCKUP_ARTWORK;
const grid = process.env.ALACAM_PRIVATE_MOCKUP_GRID;
if (!assets || !artwork || !grid)
  throw new Error(
    "Set ALACAM_PRIVATE_MOCKUP_ASSETS, ALACAM_PRIVATE_MOCKUP_ARTWORK and ALACAM_PRIVATE_MOCKUP_GRID to private local files.",
  );
const output = resolve(
  process.env.ALACAM_PRIVATE_MOCKUP_OUTPUT ||
    resolve(tmpdir(), "alacam-private-mockup-qa"),
);
await mkdir(output, { recursive: true });
const hash = (value) => createHash("sha256").update(value).digest("hex");
let session;
try {
  session = await createPrivateMockupSession({ assets, artwork });
  const { page } = session;
  assert.equal(session.state.width, 600);
  assert.equal(session.state.height, 800);
  const sceneInformation = page.getByLabel("Sahne bilgisi", { exact: true });
  assert.equal(await sceneInformation.isVisible(), true);
  const note = await sceneInformation.innerText();
  assert.match(note, /Yaklaşık UV eşlemesi/);
  assert.match(note, /merkez etiket bölgesi/);
  assert.match(note, /tam sarım değildir/i);
  assert.match(note, /600×800/);
  const initialUrl = await page.evaluate(() =>
    window.privateMockup.export("image/png"),
  );
  const initialBytes = Buffer.from(initialUrl.split(",")[1], "base64");
  await writeFile(resolve(output, "artwork-proof.png"), initialBytes);
  await page.screenshot({
    path: resolve(output, "desktop.png"),
    fullPage: true,
  });

  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "PNG indir", exact: true }).click();
  const downloadedPng = await pngDownload;
  const pngBytes = await readFile(await downloadedPng.path());
  assert.equal(pngBytes.readUInt32BE(16), 600);
  assert.equal(pngBytes.readUInt32BE(20), 800);
  assert.equal(hash(pngBytes), hash(initialBytes));
  await downloadedPng.saveAs(resolve(output, "download.png"));

  const jpgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "JPG indir", exact: true }).click();
  const downloadedJpg = await jpgDownload;
  const jpgBytes = await readFile(await downloadedJpg.path());
  assert.equal(jpgBytes[0], 0xff);
  assert.equal(jpgBytes[1], 0xd8);
  const jpgSize = await page.evaluate(
    async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    },
    `data:image/jpeg;base64,${jpgBytes.toString("base64")}`,
  );
  assert.deepEqual(jpgSize, { width: 600, height: 800 });
  await downloadedJpg.saveAs(resolve(output, "download.jpg"));

  await page.getByLabel("Tasarım görseli seç").setInputFiles(grid);
  await page.waitForFunction(
    () => window.privateMockup.ready && window.privateMockup.renders === 2,
  );
  const gridUrl = await page.evaluate(() =>
    window.privateMockup.export("image/png"),
  );
  const gridBytes = Buffer.from(gridUrl.split(",")[1], "base64");
  assert.notEqual(hash(gridBytes), hash(initialBytes));
  await writeFile(resolve(output, "grid-proof.png"), gridBytes);
  await page.screenshot({
    path: resolve(output, "grid-desktop.png"),
    fullPage: true,
  });

  await page.getByLabel("Tasarım görseli seç").setInputFiles(artwork);
  await page.waitForFunction(
    () => window.privateMockup.ready && window.privateMockup.renders === 3,
  );
  const restoredUrl = await page.evaluate(() =>
    window.privateMockup.export("image/png"),
  );
  const restoredBytes = Buffer.from(restoredUrl.split(",")[1], "base64");
  assert.equal(hash(restoredBytes), hash(initialBytes));
  const restored = await page.evaluate(() => ({
    approximate: window.privateMockup.approximate,
    width: window.privateMockup.width,
    height: window.privateMockup.height,
    renders: window.privateMockup.renders,
    error: window.privateMockup.error,
  }));
  assert.deepEqual(restored, {
    approximate: true,
    width: 600,
    height: 800,
    renders: 3,
    error: "",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => {
    const elements = [
      document.querySelector("#stage canvas"),
      document.querySelector("#scene-info"),
      ...document.querySelectorAll("header button,header label"),
    ];
    return {
      viewport: innerWidth,
      width: document.body.scrollWidth,
      bounds: elements.map((element) => ({
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
      })),
      nativeWidth: document.querySelector("canvas").width,
      nativeHeight: document.querySelector("canvas").height,
    };
  });
  assert.ok(mobile.width <= mobile.viewport);
  mobile.bounds.forEach((bounds) => {
    assert.ok(bounds.left >= 0);
    assert.ok(bounds.right <= mobile.viewport);
  });
  assert.equal(mobile.nativeWidth, 600);
  assert.equal(mobile.nativeHeight, 800);
  await page.screenshot({
    path: resolve(output, "mobile.png"),
    fullPage: true,
  });
  assert.equal(session.blockedRequests.length, 0);
  assert.equal(session.pageErrors.length, 0);
  const summary = {
    passed: 7,
    checks: [
      "600×800 native source",
      "approximate central-label mapping disclosure",
      "PNG exact source bytes",
      "JPG native dimensions",
      "grid replacement changes image",
      "artwork restore is deterministic",
      "mobile controls and canvas bounds",
    ],
    dimensions: jpgSize,
    sourceFilesPublished: 0,
    externalRequests: session.blockedRequests.length,
    browserErrors: session.pageErrors,
    sourcePixelsSha256: hash(initialBytes),
    restoredPixelsSha256: hash(restoredBytes),
    servedPrivateAssets: [...session.servedAssets],
    mobile,
  };
  await writeFile(
    resolve(output, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await session?.context.close().catch(() => {});
  await session?.browser.close().catch(() => {});
}
