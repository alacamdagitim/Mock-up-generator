// Actual prepared photo workflow; all server endpoints are isolated locally.
import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const base = (process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184").replace(
  /\/$/,
  "",
);
const output = "test-results/hand-cup";
const summary = {
  passed: [],
  errors: [],
  renderRequests: [],
  serverWrites: [],
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
await mkdir(output, { recursive: true });
let page;
async function context(mobile = false) {
  const session = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1456, height: 1034 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  await session.route("**/api/health", (route) =>
    route.fulfill({ json: { storageConfigured: false } }),
  );
  await session.route("**/api/designs", (route) => {
    summary.serverWrites.push(route.request().method());
    return route.fulfill({
      status: 503,
      json: { error: "Isolated test; no server writes." },
    });
  });
  const target = await session.newPage();
  target.on("pageerror", (error) => summary.errors.push(error.message));
  target.on("request", (request) => {
    if (/studioRender|three-gpu-pathtracer/.test(request.url()))
      summary.renderRequests.push(request.url());
  });
  return { session, page: target };
}
async function settled(target) {
  await expect(target.locator(".mockup-preview")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 45000 },
  );
  await expect(target.locator(".mockup-preview-canvas canvas")).toHaveCount(1);
  await expect(target.locator(".mockup-error")).toHaveCount(0);
}
async function pixels(target) {
  return hash(
    await target
      .locator(".mockup-preview-canvas canvas")
      .evaluate((canvas) => canvas.toDataURL()),
  );
}
async function imageExport(target) {
  await target
    .getByRole("button", { name: "Görsel indir", exact: true })
    .click();
  const dialog = target.getByRole("dialog", {
    name: "Görsel indir",
    exact: true,
  });
  await expect(dialog).toBeVisible({ timeout: 45000 });
  await expect(
    dialog.getByText("1448 × 1086 px", { exact: true }),
  ).toBeVisible();
  const source = dialog.locator(".studio-render-source-image");
  await expect
    .poll(() =>
      source.evaluate((image) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  return { dialog, source: await source.getAttribute("src") };
}
async function download(target, button, filename) {
  const ready = target.waitForEvent("download");
  await button.click();
  const file = await ready;
  expect(await file.failure()).toBeNull();
  await file.saveAs(`${output}/${filename}`);
  return readFile(`${output}/${filename}`);
}
async function fits(target, selector) {
  const box = await target.locator(selector).boundingBox(),
    viewport = target.viewportSize();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}
try {
  const desktop = await context();
  page = desktop.page;
  await page.goto(`${base}/hand-cup-demo.html`, {
    waitUntil: "domcontentloaded",
  });
  await settled(page);
  await expect(page.locator(".online-mode-switch")).toHaveAttribute(
    "data-mode",
    "mockup",
  );
  await expect(page.locator(".mockup-scene-card")).toHaveCount(1);
  await expect(page.locator(".mockup-scene-card")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".mockup-scene-cover img")).toHaveAttribute(
    "src",
    /hand-cup-r1\/(?:thumbnail\.jpg|base\.png)$/,
  );
  await expect(page.locator(".mockup-preview")).toHaveAttribute(
    "data-scene-id",
    "hand-cup-r1",
  );
  await page.screenshot({
    path: `${output}/desktop-mockup.png`,
    animations: "disabled",
  });
  const initial = await pixels(page);
  summary.passed.push(
    "actual hand-cup photo opens as primary mockup with a plain selectable gallery card",
  );

  await page
    .getByRole("button", { name: "Tasarımı düzenle", exact: true })
    .click();
  await expect(page.locator(".online-mode-switch")).toHaveAttribute(
    "data-mode",
    "2d",
  );
  await expect(page.locator(".online-canvas .canvas-loading")).toBeHidden();
  await page.getByRole("button", { name: "Yazı", exact: true }).click();
  await page.getByRole("button", { name: "Yazı ekle", exact: true }).click();
  await page
    .getByRole("button", { name: "More object tools", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Yazı içeriği", exact: true })
    .fill("SİZE ÖZEL TASARIM");
  await settled(page);
  await expect.poll(() => pixels(page)).not.toBe(initial);
  await page.getByRole("button", { name: "Mockupı gör", exact: true }).click();
  await expect(page.locator(".online-mode-switch")).toHaveAttribute(
    "data-mode",
    "mockup",
  );
  await settled(page);
  await page.screenshot({
    path: `${output}/desktop-edited.png`,
    animations: "disabled",
  });
  summary.passed.push(
    "text added on the dieline changes the same prepared photograph without a render job",
  );

  const capture = await imageExport(page);
  const png = await download(
    page,
    capture.dialog.getByRole("button", { name: "Görseli indir", exact: true }),
    "hand-cup-custom.png",
  );
  expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual(
    { width: 1448, height: 1086 },
  );
  expect(hash(png)).toBe(
    hash(Buffer.from(capture.source.split(",")[1], "base64")),
  );
  summary.mask = await page.evaluate(async (source) => {
    const load = async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const [before, after, mask] = await Promise.all([
      load("/product-assets/mockup-scenes/hand-cup-r1/base.png"),
      load(source),
      load("/product-assets/mockup-scenes/hand-cup-r1/front-mask.png"),
    ]);
    let outside = 0,
      outsideChanged = 0,
      insideChanged = 0;
    for (let i = 0; i < mask.length; i += 4) {
      const changed =
        before[i] !== after[i] ||
        before[i + 1] !== after[i + 1] ||
        before[i + 2] !== after[i + 2] ||
        before[i + 3] !== after[i + 3];
      if (mask[i] === 0 || mask[i + 3] === 0) {
        outside++;
        if (changed) outsideChanged++;
      } else if (changed) insideChanged++;
    }
    return { outside, outsideChanged, insideChanged };
  }, capture.source);
  expect(summary.mask.outside).toBeGreaterThan(1_000_000);
  expect(summary.mask.outsideChanged).toBe(0);
  expect(summary.mask.insideChanged).toBeGreaterThan(50_000);
  await capture.dialog
    .getByRole("button", { name: "JPG", exact: true })
    .click();
  const jpg = await download(
    page,
    capture.dialog.getByRole("button", { name: "Görseli indir", exact: true }),
    "hand-cup-custom.jpg",
  );
  const dimensions = await page.evaluate(
    async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    },
    `data:image/jpeg;base64,${jpg.toString("base64")}`,
  );
  expect(dimensions).toEqual({ width: 1448, height: 1086 });
  summary.downloads = {
    png: { width: 1448, height: 1086, bytes: png.length },
    jpg: { ...dimensions, bytes: jpg.length },
  };
  summary.passed.push(
    "native PNG/JPG downloads preserve 1448×1086; original hand/background pixels remain exact outside the print mask",
  );
  await desktop.session.close();

  const mobile = await context(true);
  page = mobile.page;
  await page.goto(`${base}/hand-cup-demo.html`);
  await settled(page);
  await fits(page, ".online-mode-switch");
  await fits(page, ".online-header-actions");
  await fits(page, ".online-save");
  await fits(page, ".mockup-preview");
  expect(
    await page
      .locator(".mockup-preview-canvas canvas")
      .evaluate((canvas) => getComputedStyle(canvas).objectFit),
  ).toBe("contain");
  await page.screenshot({
    path: `${output}/mobile-mockup.png`,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Yerleşimler", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator(".mockup-scene-cover img")
        .evaluateAll((images) =>
          images.every((image) => image.complete && image.naturalWidth > 0),
        ),
    )
    .toBe(true);
  await page
    .locator(".online-panel")
    .screenshot({
      path: `${output}/mobile-layout.png`,
      animations: "disabled",
    });
  summary.passed.push(
    "390px mobile header, footer and complete fixed photograph fit; gallery uses the prepared plain scene",
  );
  await mobile.session.close();
  expect(summary.errors).toEqual([]);
  expect(summary.renderRequests).toEqual([]);
  expect(summary.serverWrites).toEqual([]);
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  summary.failure = error.stack || String(error);
  await page
    ?.screenshot({ path: `${output}/failure.png`, animations: "disabled" })
    .catch(() => {});
  console.error(summary.failure);
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
  await browser.close();
}
