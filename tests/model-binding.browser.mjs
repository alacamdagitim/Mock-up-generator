import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { blankDesign } from "../shared/schema.mjs";

const base = process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184";
const output = "test-results/model-binding";
const canPath = process.env.ALACAM_CAN_FIXTURE;
const can = canPath ? await readFile(canPath) : null;
const svg = process.env.ALACAM_DIELINE_FIXTURE
  ? await readFile(process.env.ALACAM_DIELINE_FIXTURE, "utf8")
  : '<svg xmlns="http://www.w3.org/2000/svg" width="203mm" height="106mm" viewBox="0 0 203 106"><rect x="0.2" y="0.2" width="202.6" height="105.6" fill="none" stroke="blue" stroke-width="0.2"/></svg>';
const urls = {
  can: "https://cdn.shopify.com/files/binding-can.glb",
  ambiguous: "https://cdn.shopify.com/files/binding-ambiguous.glb",
  dieline: "https://cdn.shopify.com/files/binding-dieline.svg",
};
if (!globalThis.FileReader)
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob
        .arrayBuffer()
        .then((result) => {
          this.result = result;
          this.onloadend?.();
        })
        .catch((error) => this.onerror?.(error));
    }
  };
const synthetic = new THREE.Group();
for (const [index, name] of ["LabelA", "LabelB"].entries()) {
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 2),
    new THREE.MeshPhysicalMaterial({ color: "white", side: THREE.DoubleSide }),
  );
  panel.name = name;
  panel.position.x = index === 0 ? -0.6 : 0.6;
  synthetic.add(panel);
}
const ambiguous = Buffer.from(
  await new GLTFExporter().parseAsync(synthetic, { binary: true }),
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: process.env.ALACAM_GPU_METAL === "1" ? ["--use-angle=metal"] : [],
});
const summary = {
  passed: [],
  errors: [],
  gpuErrors: [],
  merchantFixture: Boolean(can),
};
const currentContexts = [];
async function isolated(modelUrl, suffix, seedBinding) {
  const context = await browser.newContext({
    viewport: { width: 1456, height: 1034 },
    acceptDownloads: true,
  });
  currentContexts.push(context);
  const key = `model-binding:qa:${suffix}`;
  const design = {
    ...blankDesign(),
    name: `Baskı yüzeyi · ${suffix}`,
    background: "#00dd44",
    surfaceColors: { front: "#00dd44", back: "#ffffff" },
  };
  if (seedBinding) design.modelBinding = seedBinding;
  await context.addInitScript(
    ({ key, design, modelUrl, dieline }) => {
      window.AlacamEditorConfig = {
        storageKey: key,
        productModelUrl: modelUrl,
        productDielineUrl: dieline,
      };
      if (!sessionStorage.getItem(`${key}:seeded`)) {
        localStorage.setItem(key, JSON.stringify(design));
        sessionStorage.setItem(`${key}:seeded`, "1");
      }
    },
    { key, design, modelUrl, dieline: urls.dieline },
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => summary.errors.push(error.message));
  page.on("console", (message) => {
    if (/GL_INVALID|THREE.WebGLProgram: Shader Error/.test(message.text()))
      summary.gpuErrors.push(message.text());
  });
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { storageConfigured: false } }),
  );
  const headers = { "access-control-allow-origin": "*" };
  if (can)
    await page.route(urls.can, (route) =>
      route.fulfill({ body: can, contentType: "model/gltf-binary", headers }),
    );
  await page.route(urls.ambiguous, (route) =>
    route.fulfill({
      body: ambiguous,
      contentType: "model/gltf-binary",
      headers,
    }),
  );
  await page.route(urls.dieline, (route) =>
    route.fulfill({ body: svg, contentType: "image/svg+xml", headers }),
  );
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await expect(
    page.locator('.preview-render[data-model-source="product-glb"] canvas'),
  ).toBeVisible({ timeout: 45000 });
  await page
    .getByRole("group", { name: "Çalışma görünümü", exact: true })
    .getByRole("button", { name: "3D", exact: true })
    .click();
  await expect(page.locator(".online-mode-switch")).toHaveAttribute(
    "data-mode",
    "3d",
  );
  // Wait for the mode indicator/canvas transition before capturing visual proof.
  await page.waitForTimeout(350);
  return { page, context, key };
}
async function draft(page, key) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "null"),
    key,
  );
}
async function greenPixels(page) {
  return page
    .locator('.preview-render[data-model-source="product-glb"] canvas')
    .evaluate((canvas) => {
      const copy = document.createElement("canvas");
      copy.width = canvas.width;
      copy.height = canvas.height;
      const context = copy.getContext("2d");
      context.drawImage(canvas, 0, 0);
      const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
      let green = 0;
      for (let index = 0; index < pixels.length; index += 4)
        if (
          pixels[index + 1] > 70 &&
          pixels[index + 1] > pixels[index] * 1.4 &&
          pixels[index + 1] > pixels[index + 2] * 1.25
        )
          green++;
      return green;
    });
}
async function openMapping(page) {
  await page.locator(".model-mapping-trigger").click();
  const dialog = page.getByRole("dialog", {
    name: "Baskı yüzeyini seç",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("combobox", {
      name: "Baskı yapılacak yüzey",
      exact: true,
    }),
  ).toBeFocused();
  const rectangle = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(rectangle.x).toBeGreaterThanOrEqual(0);
  expect(rectangle.y).toBeGreaterThanOrEqual(0);
  expect(rectangle.x + rectangle.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(rectangle.y + rectangle.height).toBeLessThanOrEqual(
    viewport.height + 1,
  );
  return dialog;
}
async function downloadJson(page, suffix) {
  await page
    .getByRole("button", { name: "İndirme ve JSON araçları", exact: true })
    .click();
  const promise = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Düzenlenebilir JSON", exact: true })
    .click();
  const download = await promise;
  const path = `${output}/${suffix}.json`;
  await download.saveAs(path);
  return JSON.parse(await readFile(path, "utf8"));
}
try {
  if (can) {
    const { page, context, key } = await isolated(urls.can, "merchant");
    await expect(page.locator(".product-model-note")).toContainText(
      "Sarım yüzeyi bağlı",
    );
    await expect
      .poll(() => greenPixels(page), { timeout: 30000 })
      .toBeGreaterThan(100);
    await page.screenshot({ path: `${output}/merchant-auto-green.png` });
    const native = await page.evaluate(async (modelUrl) => {
      const T = await import("/node_modules/.vite/deps/three.js");
      const { loadProductModel, createImportedAsset } =
        await import("/src/productModel.ts");
      const { captureRenderSnapshot } = await import("/src/render/snapshot.ts");
      const prototype = await loadProductModel(
        modelUrl,
        new AbortController().signal,
      );
      const asset = createImportedAsset(prototype, {
        capabilities: { getMaxAnisotropy: () => 1 },
      });
      const mapped = [],
        unprinted = [];
      prototype.traverse((node) => {
        if (!(node instanceof T.Mesh)) return;
        for (const material of Array.isArray(node.material)
          ? node.material
          : [node.material])
          (material.userData.printableFace ? mapped : unprinted).push({
            name: node.name,
            face: material.userData.printableFace,
            hasMap: Boolean(material.map),
          });
      });
      const front = document.createElement("canvas");
      front.width = 4096;
      front.height = 1024;
      const ink = front.getContext("2d");
      ink.fillStyle = "#00dd44";
      ink.fillRect(0, 0, front.width, front.height);
      const camera = new T.PerspectiveCamera(34, 1, 0.05, 100);
      camera.position.set(0, 0, 6);
      const snapshot = captureRenderSnapshot(
        prototype,
        camera,
        new T.Vector3(),
        {
          material: "matte",
          background: "#ffffff",
          backgroundStyle: "solid",
          exposure: 1,
          shadows: true,
        },
        { front },
      );
      const sleeve = snapshot.product.getObjectByName("贴图");
      const sleeveMaterial = Array.isArray(sleeve.material)
        ? sleeve.material.find((item) => item.userData.printableFace)
        : sleeve.material;
      const highres = {
        width: sleeveMaterial.map.image.width,
        height: sleeveMaterial.map.image.height,
        pixel: [
          ...sleeveMaterial.map.image.getContext("2d").getImageData(0, 0, 1, 1)
            .data,
        ],
      };
      const options = asset.surfaceOptions;
      const selected = asset.selectedSurface;
      snapshot.dispose();
      asset.dispose();
      front.width = front.height = 1;
      return { mapped, unprinted, highres, options, selected };
    }, urls.can);
    expect(native.mapped).toEqual([
      { name: "贴图", face: "front", hasMap: true },
    ]);
    expect(native.unprinted.every((item) => !item.hasMap)).toBe(true);
    expect(native.unprinted.map((item) => item.name)).toEqual(
      expect.arrayContaining(["拉环", "瓶盖", "主体", "填充物"]),
    );
    expect(native.highres).toEqual({
      width: 4096,
      height: 1024,
      pixel: [0, 221, 68, 255],
    });
    const body = native.options.find(
      (option) => option.label.includes("主体") && option.usable,
    );
    const chosen =
      body || native.options.find((option) => option.id === native.selected);
    const mapping = await openMapping(page);
    await mapping
      .getByRole("button", { name: "Bu yüzeye uygula", exact: true })
      .focus();
    await page.keyboard.press("Tab");
    await expect(
      mapping.getByRole("button", {
        name: "Baskı yüzeyi penceresini kapat",
        exact: true,
      }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      mapping.getByRole("button", { name: "Bu yüzeye uygula", exact: true }),
    ).toBeFocused();
    await page.screenshot({ path: `${output}/merchant-mapping-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${output}/merchant-mapping-mobile.png` });
    const mobileBounds = await mapping.boundingBox();
    expect(mobileBounds.x).toBeGreaterThanOrEqual(0);
    expect(mobileBounds.y).toBeGreaterThanOrEqual(0);
    expect(mobileBounds.x + mobileBounds.width).toBeLessThanOrEqual(391);
    expect(mobileBounds.y + mobileBounds.height).toBeLessThanOrEqual(845);
    await page.setViewportSize({ width: 1456, height: 1034 });
    await page.keyboard.press("Escape");
    await expect(mapping).not.toBeVisible();
    await expect(page.locator(".model-mapping-trigger")).toBeFocused();
    await openMapping(page);
    await mapping
      .getByRole("combobox", { name: "Baskı yapılacak yüzey", exact: true })
      .selectOption(chosen.id);
    await mapping
      .getByRole("checkbox", { name: "Dikey yönü çevir", exact: true })
      .check();
    await mapping
      .getByRole("button", { name: "Bu yüzeye uygula", exact: true })
      .click();
    await expect(
      page.locator('.preview-render[data-model-source="product-glb"] canvas'),
    ).toBeVisible({ timeout: 30000 });
    await expect
      .poll(async () => (await draft(page, key))?.modelBinding)
      .toEqual({ modelUrl: urls.can, targetId: chosen.id, flipY: true });
    await page
      .getByRole("group", { name: "Çalışma görünümü", exact: true })
      .getByRole("button", { name: "2D", exact: true })
      .click();
    await page.getByRole("button", { name: "Geri al", exact: true }).click();
    await expect
      .poll(async () => (await draft(page, key))?.modelBinding)
      .toBeUndefined();
    await page.getByRole("button", { name: "Yinele", exact: true }).click();
    await expect
      .poll(async () => (await draft(page, key))?.modelBinding?.targetId)
      .toBe(chosen.id);
    const exported = await downloadJson(page, "merchant-editable");
    expect(exported.modelBinding).toEqual({
      modelUrl: urls.can,
      targetId: chosen.id,
      flipY: true,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.locator('.preview-render[data-model-source="product-glb"] canvas'),
    ).toBeVisible({ timeout: 30000 });
    const restored = await openMapping(page);
    await expect(
      restored.getByRole("combobox", {
        name: "Baskı yapılacak yüzey",
        exact: true,
      }),
    ).toHaveValue(chosen.id);
    await expect(
      restored.getByRole("checkbox", { name: "Dikey yönü çevir", exact: true }),
    ).toBeChecked();
    await restored
      .getByRole("button", { name: "Otomatik eşlemeye dön", exact: true })
      .click();
    await expect
      .poll(async () => (await draft(page, key))?.modelBinding)
      .toBeUndefined();
    summary.passed.push(
      "Merchant can automatically maps only its real sleeve; visible green ink appears without Render",
      "Lid/ring/body/filling stay unprinted; snapshot resolves per-material metadata to true 4096px artwork",
      "Manual target+flipY survive JSON/reload; Undo restores automatic and redo restores manual binding",
      "Mapping modal stays inside desktop/mobile viewport and traps keyboard focus in both directions",
    );
    await context.close();
  }
  const { page, context, key } = await isolated(urls.ambiguous, "ambiguous");
  await expect(page.locator(".product-model-note")).toContainText(
    "Baskı yüzeyi henüz bağlı değil",
  );
  const dialog = await openMapping(page);
  const select = dialog.getByRole("combobox", {
    name: "Baskı yapılacak yüzey",
    exact: true,
  });
  const options = await select
    .locator("option")
    .evaluateAll((options) =>
      options
        .filter((option) => !option.disabled)
        .map((option) => ({ id: option.value, label: option.textContent })),
    );
  expect(options).toHaveLength(2);
  const selected = options.find((option) => option.label.includes("LabelB"));
  await select.selectOption(selected.id);
  await dialog
    .getByRole("button", { name: "Bu yüzeye uygula", exact: true })
    .click();
  await expect
    .poll(async () => (await draft(page, key))?.modelBinding?.targetId)
    .toBe(selected.id);
  await expect
    .poll(() => greenPixels(page), { timeout: 30000 })
    .toBeGreaterThan(100);
  await page.screenshot({ path: `${output}/ambiguous-manual.png` });
  const selectedOnly = await page.evaluate(
    async ({ modelUrl, targetId }) => {
      const T = await import("/node_modules/.vite/deps/three.js");
      const { loadProductModel, createImportedAsset } =
        await import("/src/productModel.ts");
      const prototype = await loadProductModel(
        modelUrl,
        new AbortController().signal,
      );
      const asset = createImportedAsset(
        prototype,
        { capabilities: { getMaxAnisotropy: () => 1 } },
        { targetId, flipY: false },
      );
      const mapped = [];
      prototype.traverse((node) => {
        if (node instanceof T.Mesh && node.material.userData.printableFace)
          mapped.push(node.name);
      });
      asset.dispose();
      return mapped;
    },
    { modelUrl: urls.ambiguous, targetId: selected.id },
  );
  expect(selectedOnly).toEqual(["LabelB"]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.locator('.preview-render[data-model-source="product-glb"] canvas'),
  ).toBeVisible({ timeout: 30000 });
  const restored = await openMapping(page);
  await expect(
    restored.getByRole("combobox", {
      name: "Baskı yapılacak yüzey",
      exact: true,
    }),
  ).toHaveValue(selected.id);
  await context.close();
  summary.passed.push(
    "Ambiguous labels stay unmapped until a manual choice; only LabelB receives ink and JSON reload preserves the selection",
  );
  const stale = await isolated(urls.ambiguous, "stale", {
    modelUrl: urls.ambiguous,
    targetId: "999:0",
    flipY: false,
  });
  await expect(stale.page.locator(".product-model-note")).toContainText(
    "Kayıtlı baskı yüzeyi bu modelde bulunamadı",
  );
  await expect(stale.page.locator(".product-model-note")).toContainText(
    "Baskı yüzeyi henüz bağlı değil",
  );
  summary.passed.push(
    "Stale target IDs warn explicitly and do not pretend that a surface is mapped",
  );
  expect(summary.errors).toEqual([]);
  expect(summary.gpuErrors).toEqual([]);
  await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
  console.log("Model binding browser checks passed:", summary);
} finally {
  await Promise.all(
    currentContexts.map((context) => context.close().catch(() => {})),
  );
  await browser.close();
}
