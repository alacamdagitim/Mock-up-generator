// Native GPU QA for actual product layouts, high-DPI output and completed renders.
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { blankDesign } from "../shared/schema.mjs";
const base = process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184";
const output = "test-results/render-quality";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: process.env.ALACAM_GPU_METAL === "1" ? ["--use-angle=metal"] : [],
});
const summary = { passed: [], errors: [], render: null };
let page;
try {
  const context = await browser.newContext({
    viewport: { width: 1456, height: 1034 },
    deviceScaleFactor: 2,
    acceptDownloads: true,
  });
  const design = blankDesign();
  design.name = "Görüntü kalitesi kontrolü";
  const modelUrl = process.env.ALACAM_MODEL_FIXTURE
    ? "https://cdn.shopify.com/files/quality.glb"
    : undefined;
  await context.addInitScript(
    ({ design, modelUrl }) => {
      window.AlacamEditorConfig = {
        storageKey: "quality:qa",
        productModelUrl: modelUrl,
      };
      localStorage.setItem("quality:qa", JSON.stringify(design));
    },
    { design, modelUrl },
  );
  page = await context.newPage();
  page.on("pageerror", (e) => summary.errors.push(e.message));
  page.on("console", (m) => {
    if (
      /GL_INVALID|GL_INVALID_OPERATION|THREE.WebGLProgram: Shader Error/.test(
        m.text(),
      )
    )
      summary.errors.push(m.text());
  });
  await page.route("**/api/health", (r) =>
    r.fulfill({ json: { storageConfigured: false } }),
  );
  if (modelUrl)
    await page.route(modelUrl, async (r) =>
      r.fulfill({
        body: await readFile(process.env.ALACAM_MODEL_FIXTURE),
        contentType: "model/gltf-binary",
      }),
    );
  await page.goto(base, { waitUntil: "domcontentloaded" });
  const canvas = page.locator(".preview-render canvas");
  await expect(canvas).toBeVisible({ timeout: 30000 });
  await page.locator(".online-preset-grid button").first().click();
  await page.getByRole("button", { name: "Yerleşim", exact: true }).click();
  await expect(page.locator(".layout-grid img")).toHaveCount(11, {
    timeout: 30000,
  });
  const sources = await page
    .locator(".layout-grid img")
    .evaluateAll((images) => images.map((i) => i.src));
  expect(new Set(sources).size).toBe(11);
  expect(sources.every((src) => src.startsWith("data:image/webp;"))).toBe(true);
  await page
    .getByRole("button", { name: "Üçlü seri yerleşimini uygula", exact: true })
    .click();
  await expect(page.locator(".preview-render")).toHaveAttribute(
    "data-layout",
    "trio",
  );
  await page.waitForTimeout(400);
  const buffer = await canvas.evaluate((c) => ({
    width: c.width,
    height: c.height,
    cssWidth: c.clientWidth,
    cssHeight: c.clientHeight,
  }));
  expect(buffer.width * buffer.height).toBeLessThanOrEqual(3_000_000);
  expect(buffer.width).toBeGreaterThan(buffer.cssWidth);
  summary.passed.push(
    "Eleven distinct live product thumbnails; real 2x display sharpness within 3MP budget",
  );
  summary.buffer = buffer;
  await page.screenshot({ path: `${output}/layouts-desktop.png` });
  // Test geometry independently of screen pixels: broad, off-center imported products.
  const geometry = await page.evaluate(async () => {
    const T = await import("/node_modules/.vite/deps/three.js");
    const { arrangeProduct, fittedDistance } =
      await import("/src/productLayout.ts");
    const { LAYOUTS } = await import("/shared/layouts.mjs");
    const prototype = new T.Group();
    const mesh = new T.Mesh(
      new T.BoxGeometry(6, 2, 3),
      new T.MeshStandardMaterial(),
    );
    mesh.position.set(7, 4, -2);
    prototype.add(mesh);
    const results = [];
    for (const layout of LAYOUTS)
      for (const spacing of [0.8, 1.6]) {
        const root = new T.Group();
        const bounds = arrangeProduct(root, prototype, layout.id, spacing);
        const boxes = root.children.map((o) => new T.Box3().setFromObject(o));
        let intersections = 0;
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++)
            if (boxes[i].intersectsBox(boxes[j])) intersections++;
        const grounded = !["catalog", "stagger", "fan"].includes(layout.id)
          ? boxes.every((b) => Math.abs(b.min.y + 1) < 0.00001)
          : true;
        for (const aspect of [0.45, 1, 1.6]) {
          const camera = new T.PerspectiveCamera(34, aspect, 0.05, 500);
          const direction = new T.Vector3(0.27, 0.13, 1).normalize();
          const center = bounds.getCenter(new T.Vector3());
          camera.position
            .copy(center)
            .addScaledVector(
              direction,
              fittedDistance(bounds, camera, direction),
            );
          camera.lookAt(center);
          camera.updateMatrixWorld(true);
          let clip = 0;
          for (const x of [bounds.min.x, bounds.max.x])
            for (const y of [bounds.min.y, bounds.max.y])
              for (const z of [bounds.min.z, bounds.max.z]) {
                const p = new T.Vector3(x, y, z).project(camera);
                clip = Math.max(clip, Math.abs(p.x), Math.abs(p.y));
              }
          results.push({
            id: layout.id,
            spacing,
            aspect,
            clip,
            intersections,
            grounded,
          });
        }
      }
    mesh.geometry.dispose();
    mesh.material.dispose();
    return results;
  });
  for (const item of geometry) {
    expect(item.clip, JSON.stringify(item)).toBeLessThan(1);
    expect(item.intersections, JSON.stringify(item)).toBe(0);
    expect(item.grounded, JSON.stringify(item)).toBe(true);
  }
  summary.passed.push(
    "66 geometry cases: wide/off-center products, spacing extremes, portrait/square/landscape; no intersections or clipping",
  );
  // Tiny SVG artboards must retain vector detail at a usable texture resolution.
  const svgSize = await page.evaluate(async () => {
    const { imageFile } = await import("/src/files.ts");
    return imageFile(
      new File(
        [
          '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><path fill="#14593c" d="M0 0H32V16H0Z"/></svg>',
        ],
        "small.svg",
        { type: "image/svg+xml" },
      ),
    );
  });
  expect(svgSize.pixelWidth).toBe(2400);
  expect(svgSize.pixelHeight).toBe(1200);
  summary.passed.push(
    "32px SVG logo rasterizes from sanitized paths at 2400px, not a blurred 32px enlargement",
  );
  if (process.env.ALACAM_QUALITY_RENDER === "1") {
    await page
      .getByRole("button", { name: "Tek ürün yerleşimini uygula", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Görsel indir", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Stüdyo render",
      exact: true,
    });
    await dialog
      .getByRole("button", { name: "Stüdyo render", exact: true })
      .click();
    await dialog.getByRole("button", { name: "2048 px", exact: true }).click();
    const start = Date.now();
    await dialog
      .getByRole("button", { name: "Render oluştur", exact: true })
      .click();
    while (!(await dialog.locator(".studio-render-image").count())) {
      const error = dialog.getByRole("alert");
      if (await error.count()) throw Error(await error.innerText());
      if (Date.now() - start > 180000) throw Error("Real 2K render timed out");
      console.log(
        "Real GPU render:",
        await dialog.getByRole("status").innerText(),
      );
      await page.waitForTimeout(1500);
    }
    const download = page.waitForEvent("download");
    await dialog.getByRole("link", { name: "PNG indir", exact: true }).click();
    const result = await download;
    const png = await readFile(await result.path());
    expect(png.readUInt32BE(16)).toBe(2048);
    expect(png.readUInt32BE(20)).toBe(2048);
    const colorPixels = await dialog
      .locator(".studio-render-image")
      .evaluate((img) => {
        const c = document.createElement("canvas");
        c.width = c.height = 512;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, 512, 512);
        const pixels = ctx.getImageData(0, 0, 512, 512).data;
        let green = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (
            pixels[i + 1] > pixels[i] + 3 &&
            pixels[i + 1] > pixels[i + 2] + 3 &&
            pixels[i + 1] > 30
          )
            green++;
        return green;
      });
    expect(
      colorPixels,
      "The real green artwork must survive path tracing; a black silhouette is not a successful render",
    ).toBeGreaterThan(1000);
    await result.saveAs(`${output}/studio-2048.png`);
    summary.render = {
      width: 2048,
      height: 2048,
      seconds: (Date.now() - start) / 1000,
      bytes: png.length,
      colorPixels,
    };
    summary.passed.push(
      "Completed native 2048px / 64 sample render and downloaded real PNG",
    );
    await dialog
      .getByRole("button", { name: "Render penceresini kapat", exact: true })
      .click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Yerleşim", exact: true }).click();
  await expect(page.locator(".layout-grid img")).toHaveCount(11, {
    timeout: 30000,
  });
  await page.screenshot({ path: `${output}/layouts-mobile.png` });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  summary.passed.push("Mobile layout cards render without horizontal overflow");
  expect(summary.errors).toEqual([]);
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
