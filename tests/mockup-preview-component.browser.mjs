import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184";
const out = new URL("../test-results/mockup-preview/", import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const checks = [];
try {
  await page.goto(`${base}/tests/mockup-engine-fixture.html`);
  await page.waitForFunction(() => window.mockupFixture?.ready > 0);
  checks.push("component-native-scene-ready");
  await page.screenshot({ path: new URL("desktop.png", out).pathname });
  const before = await page.evaluate(() => ({
    ready: window.mockupFixture.ready,
    pixel: Array.from(
      document
        .querySelector(".mockup-preview canvas")
        .getContext("2d")
        .getImageData(512, 900, 1, 1).data,
    ),
  }));
  await page.evaluate(() => window.mockupFixture.setColor("#51b896"));
  await page.waitForFunction(
    (value) => window.mockupFixture.ready > value,
    before.ready,
  );
  const after = await page.evaluate(() =>
    Array.from(
      document
        .querySelector(".mockup-preview canvas")
        .getContext("2d")
        .getImageData(512, 900, 1, 1).data,
    ),
  );
  assert.notDeepEqual(after, before.pixel);
  checks.push("design-edits-update-without-render-job");
  const download = await page.evaluate(async () => {
    const before = document.querySelector(".mockup-preview canvas");
    const w = before.width,
      h = before.height;
    const png = await window.mockupFixture.ref.current.png();
    const image = new Image();
    image.src = png;
    await image.decode();
    return {
      png,
      width: image.naturalWidth,
      height: image.naturalHeight,
      previewSame:
        before === document.querySelector(".mockup-preview canvas") &&
        before.width === w &&
        before.height === h,
    };
  });
  assert.equal(download.width, 1024);
  assert.equal(download.height, 1365);
  assert.equal(download.previewSame, true);
  checks.push("native-capture-preserves-live-preview");
  await writeFile(
    new URL("native-alacam.png", out),
    Buffer.from(download.png.split(",")[1], "base64"),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.mockupFixture.setColor("#e8e1d3"));
  await page.waitForFunction(
    () => document.querySelector(".mockup-preview canvas")?.height === 960,
  );
  const bounds = await page.locator(".mockup-preview canvas").boundingBox();
  assert(
    bounds.x >= -0.1 &&
      bounds.x + bounds.width <= 390.1 &&
      bounds.y >= -0.1 &&
      bounds.y + bounds.height <= 844.1,
  );
  checks.push("mobile-preview-budget-and-no-overflow");
  await page.screenshot({ path: new URL("mobile.png", out).pathname });
  await page.evaluate(() =>
    window.mockupFixture.setScene(
      { ...window.mockupFixture.scene, id: "commit-race-probe" },
      true,
    ),
  );
  await page.waitForFunction(() => window.mockupFixture.probeResult);
  assert.match(
    await page.evaluate(() => window.mockupFixture.probeResult),
    /henüz hazır değil/,
  );
  checks.push("scene-props-commit-cannot-capture-previous-scene");
  await page.evaluate(() =>
    window.mockupFixture.setScene(window.mockupFixture.scene),
  );
  await page.waitForFunction(() =>
    document.querySelector(".mockup-preview canvas"),
  );
  await page.route("**/broken-mockup.png", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.evaluate(() =>
    window.mockupFixture.setScene({
      ...window.mockupFixture.scene,
      id: "broken-scene",
      baseImageUrl: "/broken-mockup.png",
    }),
  );
  await page.getByRole("alert").waitFor();
  assert.equal(await page.locator(".mockup-preview canvas").count(), 0);
  checks.push("broken-scene-clear-error-and-no-fake-preview");
  await page.evaluate(() =>
    window.mockupFixture.setScene(window.mockupFixture.scene),
  );
  await page.waitForFunction(() =>
    document.querySelector(".mockup-preview canvas"),
  );
  await page.route("**/delayed-mockup.png", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      await route.fulfill({ status: 404, body: "missing" });
    } catch {}
  });
  await page.evaluate(() => {
    window.mockupFixture.setScene({
      ...window.mockupFixture.scene,
      id: "delayed",
      baseImageUrl: "/delayed-mockup.png",
    });
    setTimeout(
      () => window.mockupFixture.setScene(window.mockupFixture.scene),
      30,
    );
  });
  await page.waitForFunction(
    () =>
      document.querySelector(".mockup-preview")?.dataset.sceneId ===
        "original-cup-studio" &&
      document.querySelector(".mockup-preview canvas"),
  );
  await page.waitForTimeout(180);
  assert.equal(await page.getByRole("alert").count(), 0);
  checks.push("scene-switch-aborts-stale-load");
  await page.evaluate(() => window.mockupFixture.unmount());
  await page.waitForTimeout(100);
  assert.equal(await page.locator("canvas").count(), 0);
  assert.deepEqual(errors, []);
  checks.push("unmount-cleans-canvas-and-no-browser-errors");
  const result = { checks, errors };
  await writeFile(
    new URL("summary.json", out),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
