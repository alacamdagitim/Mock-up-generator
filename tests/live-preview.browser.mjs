// Real GPU and user-facing download checks; no renderer/engine responses mocked.
// Optional merchant fixtures:
// ALACAM_MODEL_FIXTURE=/path/model.glb ALACAM_DIELINE_FIXTURE=/path/dieline.svg
// ALACAM_MODEL_TARGET_ID=0/0:0 is available for a deliberately manual UV target.
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { blankDesign } from "../shared/schema.mjs";

const base = process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184";
const output =
  process.env.ALACAM_LIVE_TEST_OUTPUT || "test-results/live-preview";
const modelPath = process.env.ALACAM_MODEL_FIXTURE;
const dielinePath = process.env.ALACAM_DIELINE_FIXTURE;
const modelUrl = "https://cdn.shopify.com/files/live-preview-fixture.glb";
const dielineUrl = "https://cdn.shopify.com/files/live-preview-fixture.svg";
const storageKey = "alacam:test:live-preview";
const design = blankDesign();
design.name = "ALAÇAM · Canlı görünüm";
design.background = "#4c9e2f";
let width = 600;
let height = 900;
let dieline;
if (dielinePath) {
  dieline = await readFile(dielinePath, "utf8");
  const box = /\bviewBox\s*=\s*["']([^"']+)["']/i
    .exec(dieline)?.[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    !box ||
    box.length !== 4 ||
    !box.every(Number.isFinite) ||
    box[2] <= 0 ||
    box[3] <= 0
  )
    throw new Error("The SVG fixture must define a valid viewBox.");
  const ratio = box[2] / box[3];
  width = Math.round(ratio >= 1 ? 1200 : 1200 * ratio);
  height = Math.round(ratio >= 1 ? 1200 / ratio : 1200);
  design.artboard = {
    canvasWidth: width,
    canvasHeight: height,
    sourceUrl: dielineUrl,
  };
}
if (process.env.ALACAM_MODEL_TARGET_ID)
  design.modelBinding = {
    modelUrl,
    targetId: process.env.ALACAM_MODEL_TARGET_ID,
    flipY: false,
  };
design.faces.front = [
  {
    id: "aa5d17c2-520c-4e66-95aa-25b72aa24b73",
    kind: "text",
    name: "Canlı yazı",
    x: width * 0.12,
    y: height * 0.36,
    width: width * 0.76,
    height: height * 0.25,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    fill: "#000000",
    text: "ALAÇAM\nDOĞAL SUMAK",
    fontSize: Math.max(32, Math.min(112, height * 0.14)),
    fontFamily: "Arial",
    fontWeight: "bold",
    textAlign: "center",
  },
];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
await mkdir(output, { recursive: true });
const summary = {
  passed: [],
  errors: [],
  gpuErrors: [],
  engineRequests: [],
  merchantFixture: !!modelPath,
};
let page;
try {
  const context = await browser.newContext({
    viewport: { width: 1456, height: 1034 },
    deviceScaleFactor: 2,
    acceptDownloads: true,
  });
  await context.addInitScript(
    ({ design, storageKey, modelUrl, dielineUrl, merchant, template }) => {
      window.AlacamEditorConfig = {
        storageKey,
        productTitle: "Canlı görünüm kontrolü",
        productModelUrl: merchant ? modelUrl : undefined,
        productDielineUrl: template ? dielineUrl : undefined,
      };
      localStorage.setItem(storageKey, JSON.stringify(design));
      window.livePreviewDrawCalls = 0;
      for (const Type of [WebGLRenderingContext, WebGL2RenderingContext])
        for (const method of [
          "drawArrays",
          "drawElements",
          "drawArraysInstanced",
          "drawElementsInstanced",
        ]) {
          const original = Type.prototype[method];
          if (!original) continue;
          Type.prototype[method] = function (...args) {
            if (this.canvas?.closest?.(".preview-render"))
              window.livePreviewDrawCalls++;
            return original.apply(this, args);
          };
        }
    },
    {
      design,
      storageKey,
      modelUrl,
      dielineUrl,
      merchant: !!modelPath,
      template: !!dieline,
    },
  );
  page = await context.newPage();
  page.on("pageerror", (error) => summary.errors.push(error.message));
  page.on("console", (message) => {
    if (/GL_INVALID|THREE\.WebGLProgram: Shader Error/.test(message.text()))
      summary.gpuErrors.push(message.text());
  });
  page.on("request", (request) => {
    if (/\/render\/studioRender|alacam-studioRender/.test(request.url()))
      summary.engineRequests.push(request.url());
  });
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { storageConfigured: false } }),
  );
  if (modelPath)
    await page.route(modelUrl, async (route) =>
      route.fulfill({
        body: await readFile(modelPath),
        contentType: "model/gltf-binary",
      }),
    );
  if (dieline)
    await page.route(dielineUrl, (route) =>
      route.fulfill({ body: dieline, contentType: "image/svg+xml" }),
    );
  await page.goto(base);
  const canvas = page.locator(".preview-render canvas");
  await expect(canvas).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".render-loading")).toBeHidden();
  if (dieline)
    await expect(page.locator(".product-template-overlay")).toBeVisible({
      timeout: 30_000,
    });
  await page
    .getByRole("group", { name: "Çalışma görünümü", exact: true })
    .getByRole("button", { name: "3D", exact: true })
    .click();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const before = await canvas.evaluate((element) =>
    element.toDataURL("image/png"),
  );
  summary.pixels = await canvas.evaluate((element) => {
    const sample = document.createElement("canvas");
    sample.width = 512;
    sample.height = Math.round((element.height / element.width) * 512);
    const context = sample.getContext("2d");
    context.drawImage(element, 0, 0, sample.width, sample.height);
    const data = context.getImageData(0, 0, sample.width, sample.height).data;
    let green = 0,
      ink = 0,
      opaque = 0,
      sum = 0,
      square = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 240) continue;
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2],
        luminance = (r + g + b) / 3;
      opaque++;
      sum += luminance;
      square += luminance * luminance;
      if (g > r * 1.25 && g > b * 1.15 && g > 40) green++;
      if (luminance < 80) ink++;
    }
    return {
      green,
      ink,
      opaque,
      variance: square / opaque - (sum / opaque) ** 2,
    };
  });
  expect(summary.pixels.green).toBeGreaterThan(1000);
  expect(summary.pixels.ink).toBeGreaterThan(30);
  expect(summary.pixels.variance).toBeGreaterThan(100);
  summary.passed.push(
    "Real 3D product contains visible green artwork, dark lettering and shading variation",
  );
  const draws = await page.evaluate(() => window.livePreviewDrawCalls);
  await page.waitForTimeout(1200);
  summary.idleDrawCalls = await page.evaluate(
    (previous) => window.livePreviewDrawCalls - previous,
    draws,
  );
  expect(summary.idleDrawCalls).toBe(0);
  summary.passed.push("Idle live view submits no continuous GPU draw calls");
  const started = Date.now();
  await page.getByRole("button", { name: "Görsel indir", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Stüdyo render",
    exact: true,
  });
  await expect(dialog).toHaveAttribute("data-image-mode", "live");
  const downloadButton = dialog.getByRole("button", {
    name: "Görseli indir",
    exact: true,
  });
  await expect(downloadButton).toBeEnabled();
  const image = dialog.locator(".studio-render-source-image");
  const source = await image.evaluate(async (element) => {
    await element.decode();
    return { width: element.naturalWidth, height: element.naturalHeight };
  });
  expect(Math.max(source.width, source.height)).toBeGreaterThanOrEqual(1024);
  expect(Math.max(source.width, source.height)).toBeLessThanOrEqual(2560);
  await page.screenshot({ path: `${output}/live-download-dialog.png` });
  const pending = page.waitForEvent("download");
  await downloadButton.click();
  const download = await pending;
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.readUInt32BE(16)).toBe(source.width);
  expect(bytes.readUInt32BE(20)).toBe(source.height);
  await download.saveAs(`${output}/live-product.png`);
  summary.capture = {
    ...source,
    bytes: bytes.length,
    elapsedMs: Date.now() - started,
  };
  expect(summary.capture.elapsedMs).toBeLessThan(10_000);
  await dialog
    .getByRole("button", { name: "Render penceresini kapat", exact: true })
    .click();
  expect(
    await canvas.evaluate((element) => element.toDataURL("image/png")),
  ).toBe(before);
  summary.passed.push(
    "Immediate native PNG preserves source pixels/dimensions and returns to the unchanged live camera",
  );
  expect(summary.engineRequests).toEqual([]);
  expect(summary.errors).toEqual([]);
  expect(summary.gpuErrors).toEqual([]);
  summary.passed.push(
    "Live viewing and PNG capture never import the offline path-tracing engine",
  );
  await page.screenshot({ path: `${output}/live-product-editor.png` });
  await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(summary);
  await context.close();
} catch (error) {
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(
    `${output}/summary.json`,
    JSON.stringify({ ...summary, error: String(error) }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
