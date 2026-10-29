// Integrated public mockup workflow. API traffic is intercepted in an isolated
// browser context; this test never writes to a merchant store or real server.
import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const base = (process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184").replace(
  /\/$/,
  "",
);
const output = "test-results/mockup-workflow";
const key = "alacam:mockup-demo:v1";
const secondId = "qa-second-scene";
const summary = {
  passed: [],
  errors: [],
  engineRequests: [],
  serverWrites: [],
  downloads: {},
};
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
await mkdir(output, { recursive: true });
let page;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pngSize = (bytes) => {
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};
async function settled(target) {
  await expect(target.locator(".mockup-preview")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 45000 },
  );
  await expect(target.locator(".mockup-preview-canvas canvas")).toHaveCount(1);
  await expect(target.locator(".mockup-error")).toHaveCount(0);
}
async function projects(target) {
  return target.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("alacam-design-library", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const value = request.result;
        const store = value.createObjectStore("projects", { keyPath: "id" });
        store.createIndex("scope", "scope");
        value.createObjectStore("documents", { keyPath: "id" });
      };
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db
          .transaction("projects", "readonly")
          .objectStore("projects")
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}
async function thumbnail(target, source) {
  return target.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const ratio = Math.min(
      1,
      420 / image.naturalWidth,
      320 / image.naturalHeight,
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * ratio);
    canvas.height = Math.round(image.naturalHeight * ratio);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.86);
  }, source);
}
async function mockContext({
  server = false,
  fail = false,
  stale = false,
  mobile = false,
} = {}) {
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1456, height: 1034 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  if (stale)
    await context.addInitScript(
      ({ key }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            schemaVersion: 1,
            productId: "doypack-v1",
            name: "Stale scene",
            updatedAt: new Date().toISOString(),
            faces: { front: [], back: [] },
            background: "#ffffff",
            presentation: {
              material: "matte",
              background: "#dfe8f6",
              backgroundStyle: "gradient",
              exposure: 1.1,
              shadows: true,
              layout: "single",
              spacing: 1,
              lighting: "softbox",
              quality: "balanced",
              mockupSceneId: "deleted-scene-r1",
            },
          }),
        );
      },
      { key },
    );
  const target = await context.newPage();
  target.on("pageerror", (error) => summary.errors.push(error.message));
  target.on("request", (request) => {
    if (/studioRender|three-gpu-pathtracer/.test(request.url()))
      summary.engineRequests.push(request.url());
    if (request.method() === "POST" && /\/api\//.test(request.url()))
      summary.serverWrites.push(request.url());
  });
  await target.route("**/api/health", (route) =>
    route.fulfill({ json: { storageConfigured: server } }),
  );
  await target.route("**/api/designs", async (route) => {
    if (route.request().method() !== "POST") return route.abort();
    target.__savedBody = route.request().postDataJSON();
    await route.fulfill({
      json: {
        id: "qa-local-only",
        designUrl: "https://example.test/qa-design.json",
        previewUrl: "https://example.test/qa-preview.png",
      },
    });
  });
  // Add a second original scene through the real page's configuration boundary.
  // It intentionally reuses the licensed-to-us CC0 sample source passes only.
  await target.route("**/mockup-demo.html*", async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    const code = original.replace(
      "scenes: DEMO_MOCKUP_SCENES",
      `scenes: [...DEMO_MOCKUP_SCENES, { ...DEMO_MOCKUP_SCENES[0], id: '${secondId}', title: 'İkinci özgün sahne' }]`,
    );
    await route.fulfill({ response, body: code });
  });
  if (fail)
    await target.route("**/original-cup/base.png", (route) =>
      route.fulfill({ status: 404, body: "missing mockup fixture" }),
    );
  return { context, page: target };
}
async function openExport(target) {
  await target
    .getByRole("button", { name: "Görsel indir", exact: true })
    .click();
  const dialog = target.getByRole("dialog", {
    name: "Görsel indir",
    exact: true,
  });
  await expect(dialog).toBeVisible({ timeout: 30000 });
  await expect(
    dialog.getByText("1024 × 1365 px", { exact: true }),
  ).toBeVisible();
  const image = dialog.locator(".studio-render-source-image");
  await expect
    .poll(() =>
      image.evaluate((node) => node.complete && node.naturalWidth > 0),
    )
    .toBe(true);
  return { dialog, source: await image.getAttribute("src") };
}
async function download(target, button, name) {
  const waiting = target.waitForEvent("download");
  await button.click();
  const file = await waiting;
  expect(await file.failure()).toBeNull();
  await file.saveAs(`${output}/${name}`);
  return readFile(`${output}/${name}`);
}
async function fits(target, locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = target.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}
try {
  const desktop = await mockContext();
  page = desktop.page;
  await page.goto(`${base}/mockup-demo.html`, {
    waitUntil: "domcontentloaded",
  });
  await settled(page);
  await expect(page.locator(".online-mode-switch")).toHaveAttribute(
    "data-mode",
    "2d",
  );
  await expect(page.locator(".online-canvas .canvas-loading")).toBeHidden();
  const initial = sha(
    Buffer.from(
      await page
        .locator(".mockup-preview-canvas canvas")
        .evaluate((node) => node.toDataURL()),
    ),
  );
  await expect(page.locator(".preview-render canvas")).toHaveCount(0);
  summary.passed.push(
    "2D editor opens with live prepared mockup and no substituted GLB",
  );

  await page.getByRole("button", { name: "Yüzey rengi", exact: true }).click();
  const hex = page.getByRole("textbox", { name: "HEX renk kodu", exact: true });
  await hex.fill("#75bb91");
  await hex.press("Enter");
  await hex.press("Escape");
  await expect
    .poll(
      async () =>
        JSON.parse(
          await page.evaluate((value) => localStorage.getItem(value), key),
        ).surfaceColors?.front,
    )
    .toBe("#75bb91");
  await settled(page);
  await expect
    .poll(async () =>
      sha(
        Buffer.from(
          await page
            .locator(".mockup-preview-canvas canvas")
            .evaluate((node) => node.toDataURL()),
        ),
      ),
    )
    .not.toBe(initial);
  const green = sha(
    Buffer.from(
      await page
        .locator(".mockup-preview-canvas canvas")
        .evaluate((node) => node.toDataURL()),
    ),
  );
  await page.getByRole("button", { name: "Yazı", exact: true }).click();
  await page.getByRole("button", { name: "Yazı ekle", exact: true }).click();
  await page
    .getByRole("button", { name: "More object tools", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Yazı içeriği", exact: true })
    .fill("ALAÇAM MATCHA");
  await settled(page);
  await expect
    .poll(async () =>
      sha(
        Buffer.from(
          await page
            .locator(".mockup-preview-canvas canvas")
            .evaluate((node) => node.toDataURL()),
        ),
      ),
    )
    .not.toBe(green);
  summary.passed.push(
    "surface color and text edits change visible mockup pixels without render",
  );
  await page.screenshot({
    path: `${output}/desktop-edit.png`,
    animations: "disabled",
  });

  await page.getByRole("button", { name: "Yerleşim", exact: true }).click();
  await page
    .getByRole("button", {
      name: "İkinci özgün sahne mockup sahnesini seç",
      exact: true,
    })
    .click();
  await settled(page);
  await expect(page.locator(".mockup-preview")).toHaveAttribute(
    "data-scene-id",
    secondId,
  );
  await expect
    .poll(
      async () =>
        JSON.parse(
          await page.evaluate((value) => localStorage.getItem(value), key),
        ).presentation?.mockupSceneId,
    )
    .toBe(secondId);
  await page
    .getByRole("button", { name: "İndirme ve JSON araçları", exact: true })
    .click();
  const json = JSON.parse(
    await download(
      page,
      page.getByRole("link", { name: "Düzenlenebilir JSON", exact: true }),
      "editable.json",
    ),
  );
  expect(json.presentation.mockupSceneId).toBe(secondId);
  expect(json.faces.front[0].text).toBe("ALAÇAM MATCHA");
  await page.reload();
  await settled(page);
  await expect(page.locator(".mockup-preview")).toHaveAttribute(
    "data-scene-id",
    secondId,
  );
  summary.passed.push(
    "scene selection survives editable JSON and page reload by stable ID",
  );

  const capture = await openExport(page);
  await expect(
    capture.dialog.getByRole("button", { name: "Stüdyo render", exact: true }),
  ).toHaveCount(0);
  const png = await download(
    page,
    capture.dialog.getByRole("button", { name: "Görseli indir", exact: true }),
    "mockup.png",
  );
  expect(pngSize(png)).toEqual({ width: 1024, height: 1365 });
  const sourceBytes = Buffer.from(capture.source.split(",")[1], "base64");
  expect(sha(png)).toBe(sha(sourceBytes));
  await capture.dialog
    .getByRole("button", { name: "JPG", exact: true })
    .click();
  const jpg = await download(
    page,
    capture.dialog.getByRole("button", { name: "Görseli indir", exact: true }),
    "mockup.jpg",
  );
  const jpgSize = await page.evaluate(
    async (data) => {
      const image = new Image();
      image.src = data;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    },
    `data:image/jpeg;base64,${jpg.toString("base64")}`,
  );
  expect(jpgSize).toEqual({ width: 1024, height: 1365 });
  summary.downloads = {
    png: { ...pngSize(png), bytes: png.length, sha256: sha(png) },
    jpg: { ...jpgSize, bytes: jpg.length },
  };
  await capture.dialog
    .getByRole("button", { name: "Görsel penceresini kapat", exact: true })
    .click();
  summary.passed.push(
    "native PNG is byte-exact source, JPG keeps dimensions, separate studio render is absent",
  );

  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(
    page.getByText("3B model bağlı değil", { exact: true }),
  ).toBeVisible();
  const fromModelView = await openExport(page);
  expect(fromModelView.source).toBe(capture.source);
  await fromModelView.dialog
    .getByRole("button", { name: "Görsel penceresini kapat", exact: true })
    .click();
  summary.passed.push(
    "3D inspection still downloads and saves the selected mockup, without a flat fallback",
  );

  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(() => projects(page)).toHaveLength(1);
  const records = await projects(page);
  expect(records[0].thumbnail).toBe(await thumbnail(page, capture.source));
  expect(records[0].productId).toBe("mockup-demo-cup");
  summary.passed.push(
    "local IndexedDB thumbnail derives from selected mockup, not GLB or flat dieline",
  );
  await desktop.context.close();

  const server = await mockContext({ server: true });
  page = server.page;
  await page.goto(`${base}/mockup-demo.html`);
  await settled(page);
  const serverCapture = await openExport(page);
  await serverCapture.dialog
    .getByRole("button", { name: "Görsel penceresini kapat", exact: true })
    .click();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(() => Boolean(page.__savedBody)).toBe(true);
  expect(
    sha(Buffer.from(page.__savedBody.preview.split(",")[1], "base64")),
  ).toBe(sha(Buffer.from(serverCapture.source.split(",")[1], "base64")));
  expect(
    pngSize(Buffer.from(page.__savedBody.preview.split(",")[1], "base64")),
  ).toEqual({ width: 1024, height: 1365 });
  expect(page.__savedBody.productId).toBe("mockup-demo-cup");
  await expect(
    page.getByText("Cihaza ve sunucuya kaydedildi.", { exact: true }),
  ).toBeVisible();
  summary.passed.push(
    "controlled server POST uses the same full native mockup PNG as download",
  );
  await server.context.close();

  const mobile = await mockContext({ mobile: true });
  page = mobile.page;
  await page.goto(`${base}/mockup-demo.html`);
  await settled(page);
  await fits(page, page.locator(".online-mode-switch"));
  await page.getByRole("button", { name: "Mockup", exact: true }).click();
  await settled(page);
  await fits(page, page.locator(".mockup-preview"));
  const mobileCapture = await openExport(page);
  await fits(page, mobileCapture.dialog);
  await fits(
    page,
    mobileCapture.dialog.getByRole("button", {
      name: "Görseli indir",
      exact: true,
    }),
  );
  await page.screenshot({
    path: `${output}/mobile-export.png`,
    animations: "disabled",
  });
  summary.passed.push(
    "390px mobile mockup and native download dialog fit the viewport",
  );
  await mobile.context.close();

  const failed = await mockContext({ fail: true, server: true });
  page = failed.page;
  await page.goto(`${base}/mockup-demo.html`);
  await expect(page.locator(".mockup-error")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(
    page.getByText("Mockup sahnesi henüz hazır değil.", { exact: true }),
  ).toBeVisible();
  expect(await projects(page)).toHaveLength(0);
  expect(page.__savedBody).toBeUndefined();
  await page.getByRole("button", { name: "Görsel indir", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Görsel indir", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `${output}/missing-scene-error.png`,
    animations: "disabled",
  });
  summary.passed.push(
    "failed scene cannot download or save a substitute presentation or claim server success",
  );
  await failed.context.close();

  const stale = await mockContext({ stale: true });
  page = stale.page;
  await page.goto(`${base}/mockup-demo.html`);
  await settled(page);
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(
    page
      .getByText(
        "Kaydedilen mockup sahnesi artık bulunamıyor. Yerleşimler bölümünden bir sahne seçin.",
        { exact: true },
      )
      .last(),
  ).toBeVisible();
  expect(await projects(page)).toHaveLength(0);
  summary.passed.push(
    "removed saved scene ID never silently saves the fallback scene",
  );
  await stale.context.close();

  const legacy = await mockContext();
  page = legacy.page;
  await page.goto(base);
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.locator(".preview-render canvas")).toBeVisible({
    timeout: 45000,
  });
  await expect(
    page.getByRole("button", { name: "Mockup", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".mockup-preview")).toHaveCount(0);
  summary.passed.push(
    "legacy products keep the 3D viewer without injected mockup scenes",
  );
  await legacy.context.close();
  expect(summary.engineRequests).toEqual([]);
  expect(summary.errors).toEqual([]);
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
