// Isolated public-UI checks for the editor shell; never attaches to a user's tabs.
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { blankDesign, DEFAULT_PRESENTATION } from "../shared/schema.mjs";

const base = process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184";
const storageKey = "alacam:test:editor-shell";
const fixture = blankDesign();
fixture.name = "Editor shell regression";
fixture.presentation = { ...DEFAULT_PRESENTATION, inflate: 100 };
fixture.faces.front = [
  {
    id: "5877f464-148d-4742-beb1-45f1094f4970",
    kind: "rect",
    name: "Blue sample",
    x: 90,
    y: 190,
    width: 380,
    height: 450,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    fill: "#167be7",
  },
];
fixture.faces.back = [
  {
    ...fixture.faces.front[0],
    id: "a51fe3eb-768c-47e2-a4d8-93a43cdf44b8",
    name: "Gold sample",
    fill: "#e7a416",
  },
];
const sourceFaces = JSON.stringify(fixture.faces);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
await context.addInitScript(
  ({ storageKey, fixture }) => {
    window.AlacamEditorConfig = {
      storageKey,
      libraryKey: "alacam:test:editor-shell:library",
    };
    if (!localStorage.getItem(storageKey))
      localStorage.setItem(storageKey, JSON.stringify(fixture));
  },
  { storageKey, fixture },
);
const page = await context.newPage();
await page.route("**/api/health", (route) =>
  route.fulfill({ json: { storageConfigured: false } }),
);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await mkdir("test-results/screenshots", { recursive: true });
const modes = page.getByRole("group", {
  name: "Çalışma görünümü",
  exact: true,
});
const modeButton = (name) => modes.getByRole("button", { name, exact: true });
const canvas = page.locator(".preview-render canvas");
const draft = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
const settle = () => page.waitForTimeout(360);
const hash = async () =>
  createHash("sha256")
    .update(await canvas.evaluate((element) => element.toDataURL("image/png")))
    .digest("hex");
const closeToast = async () => {
  const close = page.getByRole("button", {
    name: "Bildirimi kapat",
    exact: true,
  });
  if (await close.isVisible()) await close.click();
};
const unchangedFaces = async () =>
  expect(JSON.stringify((await draft()).faces)).toBe(sourceFaces);
const saveScreen = async (name) => {
  await page.mouse.move(2, 66);
  await settle();
  await page.screenshot({
    path: `test-results/screenshots/editor-shell-${name}.png`,
  });
};
const nonoverlap = async (toolbar) => {
  const a = await toolbar.boundingBox();
  const b = await page.locator(".online-save").boundingBox();
  expect(a, "visible dock must have a box").not.toBeNull();
  expect(b, "visible Save group must have a box").not.toBeNull();
  const area =
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  expect(area, `dock overlaps Save at ${page.viewportSize().width}px`).toBe(0);
};
const view = async (name) => {
  const trigger = page.getByRole("button", {
    name: "3D görünüm seçenekleri",
    exact: true,
  });
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
  await page
    .getByRole("group", { name: "3D görünüm seçenekleri", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
  await settle();
};
const dragModel = async (dx, dy) => {
  const box = await canvas.boundingBox();
  const x = box.x + box.width * 0.58;
  const y = box.y + box.height * 0.43;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 1 });
  await page.mouse.up();
  await page.mouse.move(2, 66);
  await settle();
};

try {
  await page.goto(base);
  await expect(page.locator(".canvas-loading")).toBeHidden();
  await expect(page.locator(".render-loading")).toBeHidden();
  await expect(canvas).toBeVisible();
  await unchangedFaces();

  for (const [width, expectedWidth, expectedHeight] of [
    [982, 114, 28],
    [1456, 130, 36],
    [1720, 150, 40],
  ]) {
    await page.setViewportSize({ width, height: 1000 });
    await settle();
    const bounds = await modes.boundingBox();
    expect(bounds.width, `mode width at ${width}`).toBe(expectedWidth);
    expect(bounds.height, `mode height at ${width}`).toBe(expectedHeight);
    if (width >= 1285)
      expect(
        Math.abs(bounds.x + bounds.width / 2 - width / 2),
        "wide header centering",
      ).toBeLessThan(1);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await settle();
  const slider = page.getByRole("slider", {
    name: "Resize preview window",
    exact: true,
  });
  const preview = page.getByRole("region", {
    name: "Canlı 3B önizleme",
    exact: true,
  });
  expect(await slider.getAttribute("aria-valuenow")).toBe("280");
  expect(await slider.getAttribute("aria-valuemin")).toBe("280");
  await expect(page.locator(".preview-window-indicator")).toHaveCount(1);
  await expect(page.locator(".preview-window-indicator button")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "3D önizlemeyi büyüt", exact: true }),
  ).toHaveCount(0);
  const before = await preview.boundingBox();
  const grip = await slider.boundingBox();
  const startX = grip.x + grip.width / 2;
  const startY = grip.y + grip.height / 2;
  const endX = startX - 100;
  const endY = startY + 60;
  const expectedSize = Math.round(
    before.width + Math.min(startX - endX, endY - startY),
  );
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 1 });
  await page.mouse.up();
  await expect(slider).toHaveAttribute("aria-valuenow", String(expectedSize));
  const resized = await preview.boundingBox();
  expect(resized.width).toBe(expectedSize);
  expect(resized.height).toBe(expectedSize);
  expect(resized.x + resized.width).toBe(before.x + before.width);
  expect(resized.y).toBe(before.y);
  await slider.press("End");
  await expect(slider).toHaveAttribute(
    "aria-valuenow",
    await slider.getAttribute("aria-valuemax"),
  );
  await expect(page.locator(".preview-window-resize-tip")).toHaveText(
    "The current window is maximized",
  );
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", "280");
  await unchangedFaces();

  const dock2d = page.getByRole("toolbar", {
    name: "Tuval araçları",
    exact: true,
  });
  await dock2d
    .getByRole("button", { name: "Tuvali yakınlaştır", exact: true })
    .click();
  await dock2d
    .getByRole("button", { name: "Tuvali kaydır", exact: true })
    .click();
  const viewport = await page.locator(".design-viewport").boundingBox();
  await page.mouse.move(viewport.x + 20, viewport.y + 30);
  await page.mouse.down();
  await page.mouse.move(viewport.x + 75, viewport.y + 65, { steps: 1 });
  await page.mouse.up();
  const transform2d = await page.locator(".design-paper").getAttribute("style");
  const zoom2d = await dock2d.locator("output").textContent();
  const indicator = page.locator(".online-mode-indicator");
  expect(
    await indicator.evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    ),
  ).toContain("0.3s");
  const transformBefore = await indicator.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await modeButton("3D").click();
  await settle();
  await expect(modeButton("3D")).toHaveAttribute("aria-pressed", "true");
  expect(
    await indicator.evaluate((element) => getComputedStyle(element).transform),
  ).not.toBe(transformBefore);
  const dock3d = page.getByRole("toolbar", {
    name: "3D araçları",
    exact: true,
  });
  await expect(
    dock3d.getByRole("button", { name: "3B yakınlaştır", exact: true }),
  ).toBeVisible();
  await expect(
    dock3d.getByRole("button", { name: "3B uzaklaştır", exact: true }),
  ).toBeVisible();
  await expect(
    dock3d.getByRole("slider", { name: "Paket dolgunluğu", exact: true }),
  ).toBeVisible();
  await expect(
    dock3d.getByRole("button", { name: "3D görünüm seçenekleri", exact: true }),
  ).toBeVisible();
  const zoomBefore = await hash();
  await dock3d
    .getByRole("button", { name: "3B yakınlaştır", exact: true })
    .click();
  await expect.poll(hash).not.toBe(zoomBefore);
  const zoomedHash = await hash();
  await modeButton("3D").click();
  await settle();
  expect(
    await hash(),
    "clicking the active mode must not reset the camera",
  ).toBe(zoomedHash);
  await unchangedFaces();
  await dock3d
    .getByRole("button", { name: "3B uzaklaştır", exact: true })
    .click();
  await expect.poll(hash).not.toBe(zoomedHash);
  await modeButton("2D").click();
  await settle();
  expect(
    await page.locator(".design-paper").getAttribute("style"),
    "2D zoom/pan survive mode changes",
  ).toBe(transform2d);
  expect(await dock2d.locator("output").textContent()).toBe(zoom2d);
  await saveScreen("2d");

  for (const width of [982, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await modeButton("2D").click();
    await settle();
    await nonoverlap(dock2d);
    await modeButton("3D").click();
    await settle();
    await nonoverlap(dock3d);
  }
  const inflate = dock3d.getByRole("slider", {
    name: "Paket dolgunluğu",
    exact: true,
  });
  await inflate.press("Home");
  await expect(inflate).toHaveValue("0");
  await expect.poll(async () => (await draft()).presentation.inflate).toBe(0);
  const flatHash = await hash();
  await inflate.press("End");
  await expect(inflate).toHaveValue("100");
  await expect.poll(async () => (await draft()).presentation.inflate).toBe(100);
  await expect.poll(hash).not.toBe(flatHash);
  await inflate.press("Home");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(
    page.getByText("Bu cihazda kaydedildi. Sunucu depolaması bağlı değil.", {
      exact: true,
    }),
  ).toBeVisible();
  await closeToast();
  await page.reload();
  await expect(page.locator(".canvas-loading")).toBeHidden();
  await expect(page.locator(".render-loading")).toBeHidden();
  await modeButton("3D").click();
  await expect(inflate).toHaveValue("0");
  expect((await draft()).presentation.inflate).toBe(0);
  await inflate.press("End");
  await unchangedFaces();

  await view("Front");
  const frontHash = await hash();
  await view("Back");
  expect(await hash()).not.toBe(frontHash);
  await view("Perspective");
  expect(await hash()).not.toBe(frontHash);
  await dock3d
    .getByRole("button", { name: "3D görünüm seçenekleri", exact: true })
    .click();
  const viewMenu = page.getByRole("group", {
    name: "3D görünüm seçenekleri",
    exact: true,
  });
  await viewMenu.getByRole("button", { name: "Pan 3D", exact: true }).click();
  await expect(
    viewMenu.getByRole("button", { name: "Pan 3D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await viewMenu
    .getByRole("button", { name: "Rotate 3D", exact: true })
    .click();
  await expect(
    viewMenu.getByRole("button", { name: "Rotate 3D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await dock3d
    .getByRole("button", { name: "3D görünüm seçenekleri", exact: true })
    .click();
  await view("Front");
  await dragModel(40, 4);
  const diagonal = await hash();
  await view("Front");
  await dragModel(40, 0);
  const horizontal = await hash();
  expect(horizontal).toBe(diagonal);
  console.log(
    `Dominant-axis PNG comparison: ${diagonal === horizontal ? "identical" : "minor render/rounding difference"} (${diagonal.slice(0, 12)} / ${horizontal.slice(0, 12)}).`,
  );
  await unchangedFaces();
  await saveScreen("3d");
  expect(errors).toEqual([]);
  console.log(
    "Editor shell checks passed: responsive mode switch, centering/animation, stable active-mode clicks, 2D state, anchored resize, keyboard bounds, 3D controls, inflate persistence, views, and unobstructed docks.",
  );
} catch (error) {
  await page
    .screenshot({ path: "test-results/screenshots/editor-shell-failure.png" })
    .catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
