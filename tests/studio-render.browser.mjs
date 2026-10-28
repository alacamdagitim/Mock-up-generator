// Real offline-render QA. Browser storage, fixtures and downloads are isolated.
// No engine, progress, output image or completed response is replaced by a mock.
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { blankDesign, DEFAULT_PRESENTATION } from "../shared/schema.mjs";

const base = process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184";
const maxRenderMs = Number(process.env.ALACAM_RENDER_TIMEOUT_MS || 120_000);
const uiOnly = process.env.ALACAM_RENDER_UI_ONLY === "1";
const output = "test-results/studio-render";
const summaryPath = `${output}/${uiOnly ? "summary-ui" : "summary"}.json`;
const draftKey = "alacam:draft:v1:doypack";
const element = (kind, id, fill, x, y, width, height, extra = {}) => ({
  kind,
  id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  name: `QA ${kind} ${id}`,
  x,
  y,
  width,
  height,
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  fill,
  ...extra,
});
const fixture = {
  ...blankDesign(),
  name: "STUDIO RENDER QA",
  presentation: {
    ...DEFAULT_PRESENTATION,
    finishing: "matte",
    substrate: "white",
    printMode: "color",
    inflate: 100,
  },
  faces: {
    front: [
      element("rect", 1, "#e05238", 35, 105, 530, 730),
      element("rect", 2, "#137bff", 35, 510, 530, 260),
      element("text", 3, "#ffffff", 105, 250, 400, 100, {
        text: "ALAÇAM QA",
        fontFamily: "Arial",
        fontSize: 48,
        textAlign: "center",
      }),
    ],
    back: [element("rect", 4, "#2c9e64", 35, 105, 530, 730)],
  },
};

await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const pageErrors = [];
const gpuErrors = [];
const navigations = [];
const summary = { passed: [], render: null };
let latestPage;

async function isolatedPage(viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  await context.addInitScript(
    ({ key, design }) => {
      if (!sessionStorage.getItem("studio-render-qa-seeded")) {
        localStorage.setItem(key, JSON.stringify(design));
        sessionStorage.setItem("studio-render-qa-seeded", "1");
      }
      // Observe native resource creation/deletion without changing render work.
      const records = new Map();
      const urls = { created: [], revoked: [] };
      const resourceMethods = [
        ["Texture", "textures"],
        ["Buffer", "buffers"],
        ["Program", "programs"],
      ];
      for (const WebGLClass of [
        window.WebGLRenderingContext,
        window.WebGL2RenderingContext,
      ]) {
        if (!WebGLClass) continue;
        for (const [kind, collection] of resourceMethods) {
          const create = WebGLClass.prototype[`create${kind}`];
          const remove = WebGLClass.prototype[`delete${kind}`];
          WebGLClass.prototype[`create${kind}`] = function (...args) {
            const resource = create.apply(this, args);
            if (!records.has(this))
              records.set(this, {
                textures: new Set(),
                buffers: new Set(),
                programs: new Set(),
              });
            if (resource) records.get(this)[collection].add(resource);
            return resource;
          };
          WebGLClass.prototype[`delete${kind}`] = function (...args) {
            records.get(this)?.[collection].delete(args[0]);
            return remove.apply(this, args);
          };
        }
      }
      const createUrl = URL.createObjectURL;
      const revokeUrl = URL.revokeObjectURL;
      URL.createObjectURL = function (...args) {
        const url = createUrl.apply(this, args);
        urls.created.push(url);
        return url;
      };
      URL.revokeObjectURL = function (url) {
        urls.revoked.push(url);
        return revokeUrl.call(this, url);
      };
      window.studioRenderQa = {
        urls,
        resources: () =>
          Array.from(records, ([gl, state]) => ({
            studio: gl.canvas.classList.contains("studio-render-canvas"),
            lost: gl.isContextLost(),
            textures: state.textures.size,
            buffers: state.buffers.size,
            programs: state.programs.size,
          })),
      };
    },
    { key: draftKey, design: fixture },
  );
  const page = await context.newPage();
  latestPage = page;
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const value = { url: frame.url(), at: new Date().toISOString() };
    navigations.push(value);
    console.log("QA document navigation:", value);
  });
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { storageConfigured: false } }),
  );
  page.on("pageerror", (error) => {
    const details = error.stack || error.message;
    pageErrors.push(details);
    console.error("QA browser error:", details);
  });
  page.on("console", (message) => {
    if (message.text().includes("[vite]")) console.log(message.text());
    if (
      /GL_INVALID|INVALID_(?:VALUE|ENUM|OPERATION)|THREE\.WebGLProgram: Shader Error|WebGL:.*(?:error|failed)/i.test(
        message.text(),
      )
    )
      gpuErrors.push(message.text());
  });
  await page.goto(base);
  await expect(page.locator(".canvas-loading")).toBeHidden();
  await expect(page.locator(".preview-render canvas")).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)).faces.front.length,
        draftKey,
      ),
    )
    .toBe(3);
  return { context, page };
}

const draft = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), draftKey);
const dialogFor = (page) =>
  page.getByRole("dialog", { name: "Stüdyo render", exact: true });
const open = async (page) => {
  await page.getByRole("button", { name: "Render al", exact: true }).click();
  await expect(dialogFor(page)).toBeVisible();
  return dialogFor(page);
};
async function resourcesReleased(page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const records = window.studioRenderQa
            .resources()
            .filter((record) => record.studio);
          return records.every(
            (record) =>
              record.lost ||
              !(record.textures + record.buffers + record.programs),
          );
        }),
      { timeout: 15_000, message: "Offline WebGL resources must be released" },
    )
    .toBe(true);
}

try {
  if (!uiOnly) {
    const { context, page } = await isolatedPage();
    const before = await draft(page);
    let dialog = await open(page);
    await expect(
      dialog.getByRole("button", { name: "2048 px", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByRole("tab")).toHaveCount(3);
    await expect(dialog.locator(".studio-render-source-image")).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "PNG", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await dialog.getByRole("button", { name: "1024 px", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "2048 px", exact: true }),
    ).toBeEnabled();
    await dialog.getByRole("button", { name: "2048 px", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "2048 px", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await dialog.getByRole("button", { name: "1024 px", exact: true }).click();
    await dialog.locator(".studio-render-advanced summary").click();
    await expect(dialog.locator(".studio-render-advanced")).toHaveAttribute(
      "open",
      "",
    );
    await dialog
      .getByRole("button", { name: "Gün ışığı", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Kontrast", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Yumuşak stüdyo", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Sıcak", exact: true }).click();
    await dialog.getByRole("button", { name: "Beyaz", exact: true }).click();
    await dialog
      .getByRole("combobox", { name: "Render görsel oranı" })
      .selectOption("portrait");
    await expect(dialog.locator(".studio-render-frame")).toHaveAttribute(
      "data-aspect",
      "portrait",
    );
    await dialog
      .getByRole("combobox", { name: "Render görsel oranı" })
      .selectOption("landscape");
    await expect(dialog.locator(".studio-render-frame")).toHaveAttribute(
      "data-aspect",
      "landscape",
    );
    await dialog
      .getByRole("combobox", { name: "Render görsel oranı" })
      .selectOption("square");
    await page.screenshot({ path: `${output}/settings-desktop.png` });
    summary.passed.push(
      "Desktop 2K default, real scene preview, three export tabs; explicit1K/2K, advanced studio, background and aspect select",
    );

    // Cancel a real high-sample job, then retry at the default 64 samples.
    await dialog.getByRole("button", { name: /Yüksek.*256/ }).click();
    await dialog
      .getByRole("button", { name: "Render oluştur", exact: true })
      .click();
    await expect(
      dialog.getByRole("progressbar", { name: "Render ilerlemesi" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "2048 px", exact: true }),
    ).toBeDisabled();
    await expect
      .poll(
        () => dialog.locator(".studio-render-progress-details").textContent(),
        { timeout: 45_000 },
      )
      .toMatch(/\d+(?:\.\d+)? \/ \d+ ışık örneği/);
    await dialog
      .getByRole("button", { name: "Renderı iptal et", exact: true })
      .click({ timeout: 120_000 });
    await expect(dialog.getByRole("status")).toContainText(
      "Render iptal edildi",
      {
        timeout: 90_000,
      },
    );
    await expect(
      dialog.getByRole("button", { name: "Render penceresini kapat" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect
      .poll(() =>
        dialog.evaluate((element) =>
          element.contains(element.getRootNode().activeElement),
        ),
      )
      .toBe(true);
    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(() =>
        dialog.evaluate((element) =>
          element.contains(element.getRootNode().activeElement),
        ),
      )
      .toBe(true);
    await expect(
      dialog.getByRole("link", { name: "PNG indir", exact: true }),
    ).toHaveCount(0);
    expect(await draft(page)).toEqual(before);
    await resourcesReleased(page);
    summary.passed.push(
      "Real render cancellation, retry availability and GPU cleanup",
    );

    await dialog.getByRole("button", { name: /Standart.*64/ }).click();
    await dialog
      .getByRole("button", { name: "Render oluştur", exact: true })
      .click();
    const renderStart = Date.now();
    let previousProgress = -1;
    let lastLog = 0;
    while (!(await dialog.locator(".studio-render-image").count())) {
      const error = (await dialog.getByRole("alert").count())
        ? await dialog.getByRole("alert").textContent()
        : "";
      if (error) throw new Error(`Real render failed: ${error}`);
      const now = Date.now();
      if (now - renderStart > maxRenderMs) {
        await dialog
          .getByRole("button", { name: "Renderı iptal et", exact: true })
          .click();
        throw new Error(
          `Real 1024/64 render exceeded ${maxRenderMs}ms; cancelled`,
        );
      }
      const progress = await dialog.evaluate((element) =>
        element.querySelector("progress")?.getAttribute("value"),
      );
      if (progress != null) {
        expect(Number(progress)).toBeGreaterThanOrEqual(previousProgress);
        previousProgress = Number(progress);
      }
      if (now - lastLog > 10_000) {
        console.log(
          `Studio render ${(now - renderStart) / 1000}s: ${await dialog.getByRole("status").innerText()}`,
        );
        lastLog = now;
      }
      await page.waitForTimeout(500);
    }
    await expect(dialog.getByRole("status")).toContainText("Render hazır");
    await expect(dialog.getByRole("status")).toContainText("64 ışık örneği");
    await resourcesReleased(page);
    expect(await draft(page)).toEqual(before);
    await page.screenshot({ path: `${output}/completed-desktop.png` });
    const downloading = page.waitForEvent("download");
    const downloadLink = dialog.getByRole("link", {
      name: "PNG indir",
      exact: true,
    });
    const blobUrl = await downloadLink.getAttribute("href");
    await downloadLink.click();
    const download = await downloading;
    const png = await readFile(await download.path());
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(1024);
    await download.saveAs(`${output}/alacam-studyo-render.png`);
    const pixels = await page.evaluate(async (encoded) => {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, 128, 128);
      const data = ctx.getImageData(0, 0, 128, 128).data;
      let red = 0,
        blue = 0,
        opaque = 0,
        sum = 0,
        square = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i],
          g = data[i + 1],
          b = data[i + 2];
        if (data[i + 3] > 240) opaque += 1;
        if (r > g * 1.25 && r > b * 1.25 && r > 60) red += 1;
        if (b > r * 1.25 && b > g * 1.1 && b > 60) blue += 1;
        const luminance = (r + g + b) / 3;
        sum += luminance;
        square += luminance * luminance;
      }
      const count = data.length / 4;
      return {
        red,
        blue,
        opaque,
        variance: square / count - (sum / count) ** 2,
        corner: Array.from(data.subarray(0, 4)),
      };
    }, png.toString("base64"));
    expect(pixels.opaque).toBeGreaterThan(16_000);
    expect(pixels.red).toBeGreaterThan(100);
    expect(pixels.blue).toBeGreaterThan(100);
    expect(pixels.variance).toBeGreaterThan(100);
    expect(pixels.corner.slice(0, 3).every((channel) => channel > 220)).toBe(
      true,
    );
    summary.render = {
      width: 1024,
      height: 1024,
      samples: 64,
      elapsedMs: Date.now() - renderStart,
      bytes: png.length,
      pixels,
    };
    summary.passed.push(
      "Completed real 1024/64 PNG: dimensions, artwork colors and pixel variance",
    );
    await dialog
      .getByRole("button", { name: "Render penceresini kapat" })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          (url) => window.studioRenderQa.urls.revoked.includes(url),
          blobUrl,
        ),
      )
      .toBe(true);
    expect(await draft(page)).toEqual(before);
    dialog = await open(page);
    await expect(
      dialog.getByRole("link", { name: "PNG indir", exact: true }),
    ).toHaveCount(0);
    await dialog.getByRole("button", { name: "1024 px", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Render oluştur", exact: true })
      .click();
    await expect(
      dialog.getByRole("progressbar", { name: "Render ilerlemesi" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await resourcesReleased(page);
    // Let native asynchronous shader callbacks run after closing the dialog.
    await page.waitForTimeout(100);
    expect(await draft(page)).toEqual(before);
    summary.passed.push(
      "Result blob revoked; reopen fresh; Escape aborts an active job; source JSON unchanged",
    );
    await context.close();
  }

  const shortDesktop = await isolatedPage({ width: 1280, height: 720 });
  const shortBefore = await draft(shortDesktop.page);
  const shortDialog = await open(shortDesktop.page);
  const shortBody = shortDialog.locator(".studio-render-body:not([hidden])");
  const shortPreview = shortBody.locator(".studio-render-preview");
  const shortSettings = shortBody.locator(".studio-render-settings");
  await shortSettings.locator(".studio-render-advanced summary").click();
  const bodyBounds = await shortBody.boundingBox();
  const previewBefore = await shortPreview.boundingBox();
  const dialogBounds = await shortDialog.boundingBox();
  expect(dialogBounds.y).toBeGreaterThanOrEqual(0);
  expect(dialogBounds.y + dialogBounds.height).toBeLessThanOrEqual(721);
  const footerBounds = await shortDialog
    .locator(".studio-render-footer")
    .boundingBox();
  expect(footerBounds.y).toBeGreaterThanOrEqual(
    bodyBounds.y + bodyBounds.height - 1,
  );
  expect(footerBounds.y + footerBounds.height).toBeLessThanOrEqual(
    dialogBounds.y + dialogBounds.height + 1,
  );
  expect(previewBefore.x).toBeGreaterThanOrEqual(bodyBounds.x);
  expect(previewBefore.y).toBeGreaterThanOrEqual(bodyBounds.y);
  expect(previewBefore.x + previewBefore.width).toBeLessThanOrEqual(
    bodyBounds.x + bodyBounds.width + 1,
  );
  expect(previewBefore.y + previewBefore.height).toBeLessThanOrEqual(
    bodyBounds.y + bodyBounds.height + 1,
  );
  expect(
    await shortSettings.evaluate(
      (element) => element.scrollHeight - element.clientHeight,
    ),
  ).toBeGreaterThan(20);
  await shortSettings.hover();
  await shortDesktop.page.mouse.wheel(0, 1400);
  await expect
    .poll(() => shortSettings.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  const previewAfter = await shortPreview.boundingBox();
  for (const dimension of ["x", "y", "width", "height"])
    expect(
      Math.abs(previewAfter[dimension] - previewBefore[dimension]),
    ).toBeLessThan(1);
  expect(await shortBody.evaluate((element) => element.scrollTop)).toBe(0);
  await shortDesktop.page.screenshot({
    path: `${output}/settings-short-desktop.png`,
  });
  await shortDialog
    .getByRole("button", { name: "Render penceresini kapat" })
    .click();
  expect(await draft(shortDesktop.page)).toEqual(shortBefore);
  await shortDesktop.context.close();
  summary.passed.push(
    "1280×720 preview and footer fit the dialog; expanded right settings scroll independently",
  );

  const mobile = await isolatedPage({ width: 390, height: 844 });
  const mobileBefore = await draft(mobile.page);
  const mobileDialog = await open(mobile.page);
  await expect(
    mobileDialog.getByRole("button", { name: "2048 px", exact: true }),
  ).toBeDisabled();
  await expect(
    mobileDialog.getByRole("button", { name: "1024 px", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(mobileDialog).toContainText(
    "Mobil cihazlarda çözünürlük 1024 px",
  );
  const bounds = await mobileDialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(391);
  await mobile.page.screenshot({ path: `${output}/settings-mobile.png` });
  await mobileDialog
    .getByRole("button", { name: "Render penceresini kapat" })
    .click();
  expect(await draft(mobile.page)).toEqual(mobileBefore);
  await mobile.context.close();
  summary.passed.push("Mobile1024 cap and viewport fit");

  // An actual network failure in an isolated context must never create success.
  const failed = await isolatedPage();
  await failed.page.route(
    /\/(?:src\/render\/studioRender\.tsx?|alacam-studioRender(?:-[^/?]+)?\.js)(?:\?.*)?$/,
    (route) => route.abort("failed"),
  );
  const failedBefore = await draft(failed.page);
  const failedDialog = await open(failed.page);
  await failedDialog
    .getByRole("button", { name: "Render oluştur", exact: true })
    .click();
  await expect(failedDialog.getByRole("alert")).toContainText(
    "Render oluşturulamadı",
    { timeout: 30_000 },
  );
  await expect(
    failedDialog.getByRole("button", { name: "Render oluştur", exact: true }),
  ).toBeEnabled();
  await expect(
    failedDialog.getByRole("link", { name: "PNG indir", exact: true }),
  ).toHaveCount(0);
  expect(await draft(failed.page)).toEqual(failedBefore);
  await failed.page.screenshot({ path: `${output}/import-error.png` });
  await failed.context.close();
  summary.passed.push(
    "Lazy engine network failure reports error without a completed/download state",
  );
  expect(pageErrors).toEqual([]);
  expect(gpuErrors).toEqual([]);
  await writeFile(summaryPath, JSON.stringify(summary, null, 2));
  console.log("Studio render browser checks passed:", summary);
} catch (error) {
  console.error("Studio render browser checks failed:", error);
  await latestPage
    ?.screenshot({ path: `${output}/failure.png` })
    .catch(() => {});
  await writeFile(
    summaryPath,
    JSON.stringify(
      { ...summary, error: String(error), pageErrors, gpuErrors, navigations },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
