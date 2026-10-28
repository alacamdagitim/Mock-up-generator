import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const base = process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184";
const model = await readFile(
  process.env.ALACAM_MODEL_FIXTURE ||
    "public/product-assets/doypack-v1-r1/model.glb",
);
const svg = process.env.ALACAM_DIELINE_FIXTURE
  ? await readFile(process.env.ALACAM_DIELINE_FIXTURE, "utf8")
  : '<svg xmlns="http://www.w3.org/2000/svg" width="198mm" height="60mm" viewBox="0 0 198 60"><g id="cut" fill="none" stroke="#2028b0"><path d="M0 0H198V60H0Z"/></g><script>alert(1)</script><image href="https://untrusted.invalid/tracker.png" width="198" height="60"/></svg>';
const modelUrl = "https://cdn.shopify.com/files/urun.glb?v=123";
const dielineUrl = "https://cdn.shopify.com/files/bicak.svg?v=456";
const mobile = process.env.ALACAM_TEST_MOBILE === "1";
const output = `test-results/product-metafields${mobile ? "-mobile" : ""}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const summary = {
  passed: [],
  pageErrors: [],
  gpuErrors: [],
  actualMerchantFiles: !!process.env.ALACAM_MODEL_FIXTURE,
};
let page;
try {
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1456, height: 1034 },
  });
  page = await context.newPage();
  page.on("console", (message) => {
    if (/GL_INVALID|THREE.WebGLProgram/.test(message.text()))
      summary.gpuErrors.push(message.text());
  });
  page.on("pageerror", (error) => summary.pageErrors.push(error.message));
  const unsafeRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("untrusted.invalid"))
      unsafeRequests.push(request.url());
  });
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { storageConfigured: false } }),
  );
  await page.route("**/tests/fixtures/shopify-launcher.html", async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({
      response,
      body: html.replace(
        '"productDielineUrl": "//cdn.shopify.com/files/bicak.pdf?v=456"',
        `"productDielineUrl": "${dielineUrl}"`,
      ),
    });
  });
  let broken = false;
  await page.route(modelUrl, (route) =>
    route.fulfill({
      contentType: "model/gltf-binary",
      body: broken ? Buffer.from("invalid") : model,
    }),
  );
  await page.route(dielineUrl, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: svg }),
  );
  const dialog = page.getByRole("dialog", {
    name: "Alaçam Tasarım Editörü",
    exact: true,
  });
  const mode3d = () =>
    dialog
      .getByRole("group", { name: "Çalışma görünümü", exact: true })
      .getByRole("button", { name: "3D", exact: true })
      .click();
  const launch = async () => {
    await page.goto(`${base}/tests/fixtures/shopify-launcher.html`);
    await page
      .getByRole("button", { name: "Design online · Beyaz", exact: true })
      .click();
    await expect(
      dialog.locator('.preview-render[data-model-source="product-glb"] canvas'),
    ).toHaveCount(1, { timeout: 45000 });
    await expect(dialog.locator(".product-template-overlay")).toBeVisible({
      timeout: 30000,
    });
    await expect(dialog.locator(".canvas-loading")).toBeHidden();
    if (mobile)
      await dialog
        .getByRole("button", {
          name: "Ürün ayarlarını aç veya kapat",
          exact: true,
        })
        .click();
    await expect(
      dialog.getByText("198 × 60 mm", { exact: true }),
    ).toBeVisible();
    if (mobile)
      await dialog
        .getByRole("button", {
          name: "Ürün ayarlarını aç veya kapat",
          exact: true,
        })
        .click();
    await expect(dialog.locator(".artboard")).toHaveCSS("width", "1200px");
    await expect(dialog.locator(".artboard")).toHaveCSS("height", "364px");
  };
  await launch();
  await expect(
    dialog.locator('.preview-render[data-model-source="sample"]'),
  ).toHaveCount(0);
  await expect(dialog.locator(".product-model-note")).toContainText("bağlı");
  expect(unsafeRequests).toEqual([]);
  summary.passed.push(
    "Product GLB replaces the sample; SVG creates a 198 × 60 mm landscape artboard and safe guide overlay",
  );
  const canvas = dialog.locator(".preview-render canvas");
  if (mobile) await mode3d();
  const before = await canvas.screenshot();
  await dialog
    .locator('input[type="file"][accept=".png,.jpg,.jpeg,.svg"]')
    .setInputFiles({
      name: "alacam-logo.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180"><rect width="600" height="180" fill="#135d48"/><circle cx="80" cy="90" r="60" fill="#ffc85c"/><text x="165" y="118" font-family="Arial" font-size="76" fill="white">ALAÇAM</text></svg>',
      ),
    });
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("alacam:test:launcher:a") || "{}")
            .faces?.front?.length || 0,
      ),
    )
    .toBe(1);
  if (mobile) await mode3d();
  await expect
    .poll(async () => (await canvas.screenshot()).equals(before))
    .toBe(false);
  const draft = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("alacam:test:launcher:a")),
  );
  expect(draft.artboard).toMatchObject({
    canvasWidth: 1200,
    canvasHeight: 364,
    widthMm: 198,
    heightMm: 60,
    sourceUrl: dielineUrl,
  });
  expect(draft.faces.front[0].y).toBeGreaterThanOrEqual(0);
  expect(
    draft.faces.front[0].y +
      draft.faces.front[0].height * draft.faces.front[0].scaleY,
  ).toBeLessThanOrEqual(364);
  await page.screenshot({ path: `${output}/product-logo.png` });
  summary.passed.push(
    "Logo upload fits the new artboard, updates the GLB UV texture and persists editable artboard metadata",
  );
  if (process.env.ALACAM_TEST_RENDER === "1") {
    await dialog
      .getByRole("button", { name: "Görsel indir", exact: true })
      .click();
    const studio = page.getByRole("dialog", {
      name: "Stüdyo render",
      exact: true,
    });
    await studio
      .getByRole("button", { name: "Stüdyo render", exact: true })
      .click();
    await studio
      .getByRole("button", { name: "Render oluştur", exact: true })
      .click();
    await expect(
      studio.getByRole("link", { name: "PNG indir", exact: true }),
    ).toBeVisible({ timeout: 180000 });
    const download = page.waitForEvent("download");
    await studio.getByRole("link", { name: "PNG indir", exact: true }).click();
    await (await download).saveAs(`${output}/product-render.png`);
    const png = await readFile(`${output}/product-render.png`);
    expect(png.readUInt32BE(16)).toBe(1024);
    await studio
      .getByRole("button", { name: "Render penceresini kapat", exact: true })
      .click();
    summary.passed.push(
      "Actual product GLB with the logo completes a 1024 px studio render and downloadable PNG",
    );
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await launch();
  await expect(dialog.locator(".canvas-empty")).toHaveCount(0);
  expect(
    (
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("alacam:test:launcher:a")),
      )
    ).faces.front,
  ).toHaveLength(1);
  summary.passed.push(
    "Reload and reopen restore the product artboard and logo without a second scale conversion",
  );
  await page.keyboard.press("Escape");
  broken = true;
  await page
    .getByRole("button", { name: "Design online · Beyaz", exact: true })
    .click();
  if (mobile) await mode3d();
  await expect(
    dialog.getByText("Ürünün GLB dosyası açılamadı", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.locator('.preview-render[data-model-source="sample"]'),
  ).toHaveCount(0);
  broken = false;
  await dialog
    .getByRole("button", { name: "Yeniden dene", exact: true })
    .click();
  await expect(
    dialog.locator('.preview-render[data-model-source="product-glb"] canvas'),
  ).toBeVisible();
  summary.passed.push(
    "Broken model exposes a retryable error and never silently falls back to doypack",
  );
  expect(summary.pageErrors).toEqual([]);
  expect(summary.gpuErrors).toEqual([]);
  await context.close();
  await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(summary);
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
