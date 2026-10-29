// Full editor with hosted-ready assets; no merchant writes or render service.
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const base = (process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184").replace(
  /\/$/,
  "",
);
const out = "test-results/tin-can-public";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const passed = [],
  errors = [],
  jobs = [];
let page;
const settle = async () => {
  await expect(page.locator(".mockup-preview")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 90000 },
  );
  await expect(page.locator(".mockup-preview-canvas canvas")).toHaveCount(1);
  await expect(page.locator(".mockup-error")).toHaveCount(0);
};
try {
  const context = await browser.newContext({
    viewport: { width: 1456, height: 1034 },
    acceptDownloads: true,
  });
  await context.route("**/api/health", (r) =>
    r.fulfill({ json: { storageConfigured: false } }),
  );
  await context.route("**/api/designs", (r) => r.abort());
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/studioRender|three-gpu-pathtracer/.test(r.url())) jobs.push(r.url());
  });
  await page.goto(`${base}/tin-can-demo.html`);
  await settle();
  await expect(page.locator(".online-mode-switch")).toHaveAttribute(
    "data-mode",
    "mockup",
  );
  await expect(page.locator(".mockup-preview")).toHaveAttribute(
    "data-scene-id",
    "tin-can-r1",
  );
  const maps = await page.evaluate(async () =>
    Promise.all(
      ["body", "lid"].map(async (name) => {
        const r = await fetch(
          `/product-assets/mockup-scenes/tin-can-r1/${name}.uv.bin.br`,
        );
        return {
          encoding: r.headers.get("content-encoding"),
          bytes: (await r.arrayBuffer()).byteLength,
        };
      }),
    ),
  );
  expect(maps).toEqual([
    { encoding: "br", bytes: 50331648 },
    { encoding: "br", bytes: 50331648 },
  ]);
  await page.screenshot({ path: `${out}/desktop.png` });
  passed.push(
    "full editor opens the two-surface photo; Brotli assets decode to exact UV dimensions",
  );
  const initial = await page
    .locator(".mockup-preview-canvas canvas")
    .evaluate((c) => c.toDataURL());
  await page
    .getByRole("button", { name: "Tasarımı düzenle", exact: true })
    .click();
  // Locate the native face selector by its actual options, independent of translated aria labels.
  const select = page
    .locator("select")
    .filter({ has: page.locator('option[value="back"]') });
  await expect(select).toHaveCount(1);
  await expect(select.locator("option")).toHaveText(["Gövde", "Kapak"]);
  await expect(page.getByTestId("artboard")).toHaveCSS("width", "1472px");
  await expect(page.getByTestId("artboard")).toHaveCSS("height", "1179px");
  await select.selectOption("back");
  await page.getByRole("button", { name: "Yazı", exact: true }).click();
  await page.getByRole("button", { name: "Yazı ekle", exact: true }).click();
  await expect
    .poll(
      () =>
        page
          .locator(".mockup-preview-canvas canvas")
          .evaluate((c) => c.toDataURL()),
      { timeout: 45000 },
    )
    .not.toBe(initial);
  await page.getByRole("button", { name: "Mockupı gör", exact: true }).click();
  await settle();
  passed.push(
    "Gövde/Kapak selectors edit separate faces on the prepared artboard",
  );
  await page.getByRole("button", { name: "Görsel indir", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Görsel indir",
    exact: true,
  });
  await expect(dialog.getByText("4096 × 3072 px", { exact: true })).toBeVisible(
    { timeout: 90000 },
  );
  const ready = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Görseli indir", exact: true })
    .click();
  const file = await ready;
  await file.saveAs(`${out}/tin-can.png`);
  const png = await readFile(`${out}/tin-can.png`);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([4096, 3072]);
  passed.push(
    "real mockup PNG download preserves 4096×3072 without a 3D render job",
  );
  await context.close();
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await mobile.route("**/api/health", (r) =>
    r.fulfill({ json: { storageConfigured: false } }),
  );
  page = await mobile.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/tin-can-demo.html`);
  await settle();
  const box = await page.locator(".mockup-preview").boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(391);
  await page.screenshot({ path: `${out}/mobile.png` });
  expect(errors).toEqual([]);
  expect(jobs).toEqual([]);
  passed.push(
    "390px mobile photograph fits and both sessions have no browser errors",
  );
  await mobile.close();
  console.log(JSON.stringify({ passed, errors, jobs }, null, 2));
} catch (e) {
  await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw e;
} finally {
  await writeFile(
    `${out}/summary.json`,
    JSON.stringify({ passed, errors, jobs }, null, 2),
  );
  await browser.close();
}
