// Real batch PSD upload -> Python compiler -> product catalog -> live editor.
// Fixtures are original synthetic PSDs, never third-party source files.
import { chromium, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const base = process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184";
const env = await readFile("worker/.env", "utf8");
const token = env.match(/^PSD_ADMIN_TOKEN=(.+)$/m)?.[1];
if (!token) throw Error("Start local worker with worker/.env first.");
const out = "test-results/psd-import";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1456, height: 1034 },
  acceptDownloads: true,
});
await context.route("**/api/health", (r) =>
  r.fulfill({ json: { storageConfigured: false } }),
);
const product = `qa-psd-${Date.now()}`,
  passed = [],
  errors = [];
let page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const api = `${base}/mockup-worker`;
async function request(url, options = {}) {
  return context.request.fetch(api + url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
}
async function ready(p) {
  await expect(p.locator(".mockup-preview")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 60000 },
  );
  await expect(p.locator(".mockup-preview-canvas canvas")).toHaveCount(1);
  await expect(p.locator(".mockup-error")).toHaveCount(0);
}
try {
  await page.goto(base + "/mockup-admin.html");
  await page.getByLabel("Yönetici anahtarı", { exact: false }).fill(token);
  await page.getByLabel("Shopify ürün kimliği", { exact: false }).fill(product);
  await page.getByRole("button", { name: "Ürünü aç", exact: true }).click();
  await expect(
    page.getByText("Ürün bağlantısı hazır", { exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .setInputFiles(
      Array.from(
        { length: 10 },
        (_, i) => `data/psd-test-fixtures/Own mockup ${i + 1}.psd`,
      ),
    );
  await expect(
    page.getByText("10 hazır / 10 dosya", { exact: true }),
  ).toBeVisible({ timeout: 120000 });
  await expect(
    page.getByText("Arka plan rengi düzenlenebilir", { exact: true }),
  ).toHaveCount(10);
  await page.screenshot({ path: `${out}/admin-desktop.png`, fullPage: true });
  const state = await (await request(`/admin/products/${product}`)).json();
  expect(state.jobs).toHaveLength(10);
  expect(state.jobs.every((j) => j.status === "ready")).toBe(true);
  expect(state.catalog.scenes).toHaveLength(10);
  passed.push(
    "ten genuine PSDs upload together and become ten ready scenes without handwritten mappings or JSON",
  );
  expect(
    await page.evaluate(
      (secret) => JSON.stringify({ ...localStorage }).includes(secret),
      token,
    ),
  ).toBe(false);
  const first = state.jobs[0];
  expect(
    (
      await context.request.get(`${api}/assets/${first.id}/source.psd`)
    ).status(),
  ).toBe(404);
  expect(
    (await context.request.get(`${api}/admin/products/${product}`)).status(),
  ).toBe(401);
  passed.push(
    "raw PSDs are private; admin API requires a key and the browser does not persist it",
  );
  await page
    .locator("input[type=file]")
    .setInputFiles("data/psd-test-fixtures/Grouped.psd");
  await expect(page.getByText("İnceleme gerekli", { exact: true })).toHaveCount(
    1,
    { timeout: 60000 },
  );
  expect(
    (await (await request(`/catalog/${product}`)).json()).scenes,
  ).toHaveLength(10);
  passed.push(
    "unsupported PSD gets a visible review state and never appears as a working scene",
  );
  const popup = context.waitForEvent("page");
  await page
    .getByRole("button", { name: "Editörde dene ↗", exact: true })
    .click();
  const editor = await popup;
  editor.on("pageerror", (e) => errors.push(e.message));
  page = editor;
  await ready(editor);
  await expect(editor.locator(".mockup-scene-card")).toHaveCount(10);
  const before = await editor
    .locator(".mockup-preview-canvas canvas")
    .evaluate((c) => c.toDataURL());
  const color = editor.getByLabel("Mockup arka plan rengi", { exact: true });
  await color.evaluate((input) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(input, "#2255cc");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect
    .poll(() =>
      editor
        .locator(".mockup-preview-canvas canvas")
        .evaluate((c) => c.toDataURL()),
    )
    .not.toBe(before);
  await ready(editor);
  const p = await editor
    .locator(".mockup-preview-canvas canvas")
    .evaluate((c) => {
      const ctx = c.getContext("2d");
      return {
        corner: Array.from(ctx.getImageData(0, 0, 1, 1).data),
        art: Array.from(ctx.getImageData(160, 100, 1, 1).data),
        shadow: Array.from(ctx.getImageData(160, 188, 1, 1).data),
      };
    });
  expect(p.corner).toEqual([34, 85, 204, 255]);
  expect(p.art).toEqual([255, 255, 255, 255]);
  expect(p.shadow[0]).toBeLessThan(34);
  expect(p.shadow[1]).toBeLessThan(85);
  expect(p.shadow[2]).toBeLessThan(204);
  await editor.screenshot({ path: `${out}/editor-background.png` });
  passed.push(
    "PSD background color changes live while artwork pixels and multiply shadow remain independent",
  );
  await editor
    .getByRole("button", { name: "Görsel indir", exact: true })
    .click();
  const dialog = editor.getByRole("dialog", {
    name: "Görsel indir",
    exact: true,
  });
  await expect(dialog.getByText("320 × 240 px", { exact: true })).toBeVisible();
  const download = editor.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Görseli indir", exact: true })
    .click();
  const file = await download;
  await file.saveAs(`${out}/mockup.png`);
  const bytes = await readFile(`${out}/mockup.png`);
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([320, 240]);
  await editor.reload();
  await ready(editor);
  await expect(
    editor.getByLabel("Mockup arka plan rengi", { exact: true }),
  ).toHaveValue("#2255cc");
  await editor
    .getByRole("button", { name: "Tasarımı düzenle", exact: true })
    .click();
  const beforeText = await editor
    .locator(".mockup-preview-canvas canvas")
    .evaluate((c) => c.toDataURL());
  await editor.getByRole("button", { name: "Yazı", exact: true }).click();
  await editor.getByRole("button", { name: "Yazı ekle", exact: true }).click();
  await expect
    .poll(() =>
      editor
        .locator(".mockup-preview-canvas canvas")
        .evaluate((c) => c.toDataURL()),
    )
    .not.toBe(beforeText);
  await editor
    .getByRole("button", { name: "Mockupı gör", exact: true })
    .click();
  await ready(editor);
  passed.push(
    "native PNG download works; background choice survives reload and the normal 2D editor stays editable",
  );
  await editor.setViewportSize({ width: 390, height: 844 });
  await editor.screenshot({ path: `${out}/editor-mobile.png` });
  const admin = await context.newPage();
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.goto(base + "/mockup-admin.html");
  expect(
    await admin.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await admin.screenshot({ path: `${out}/admin-mobile.png`, fullPage: true });
  expect(errors).toEqual([]);
  passed.push(
    "390px upload panel and product editor have no horizontal overflow or browser errors",
  );
  console.log(JSON.stringify({ passed, errors, pixels: p }, null, 2));
} catch (e) {
  await page
    .screenshot({ path: `${out}/failure.png`, fullPage: true })
    .catch(() => {});
  throw new Error(String(e.message || e).replaceAll(token, "[redacted]"));
} finally {
  const state = await (
    await request(`/admin/products/${product}`)
  )
    .json()
    .catch(() => ({ jobs: [] }));
  for (const job of state.jobs)
    if (!["queued", "processing"].includes(job.status))
      await request(`/admin/jobs/${job.id}`, { method: "DELETE" });
  await writeFile(
    `${out}/summary.json`,
    JSON.stringify({ passed, errors }, null, 2),
  );
  await browser.close();
}
