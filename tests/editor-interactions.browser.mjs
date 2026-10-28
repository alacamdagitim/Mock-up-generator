import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { blankDesign } from "../shared/schema.mjs";
const base = process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/health", (r) =>
    r.fulfill({ json: { storageConfigured: false } }),
  );
  const design = blankDesign();
  design.faces.front = [
    {
      id: "7e3fca48-bc42-4e1a-ad6b-26ad5af92461",
      name: "Gesture test",
      kind: "rect",
      x: 180,
      y: 300,
      width: 240,
      height: 240,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      fill: "#339966",
    },
  ];
  await page.addInitScript((d) => {
    if (!localStorage.getItem("alacam:draft:v1:doypack"))
      localStorage.setItem("alacam:draft:v1:doypack", JSON.stringify(d));
  }, design);
  await page.goto(base);
  await expect(page.locator(".canvas-loading")).toBeHidden();
  await expect(page.locator(".design-paper")).toBeVisible();
  const paper = page.locator(".design-paper");
  const draft = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("alacam:draft:v1:doypack")),
    );
  const original = (await draft()).faces.front;
  expect(original).toEqual(design.faces.front);
  let box = await paper.boundingBox();
  const anchor = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.4 };
  await page.mouse.move(anchor.x, anchor.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -80);
  await page.keyboard.up("Control");
  await expect
    .poll(async () => (await paper.boundingBox()).width)
    .toBeGreaterThan(box.width * 1.1);
  let changed = await paper.boundingBox();
  expect(
    Math.abs(
      (anchor.x - box.x) / box.width - (anchor.x - changed.x) / changed.width,
    ),
  ).toBeLessThan(0.003);
  expect(
    Math.abs(
      (anchor.y - box.y) / box.height - (anchor.y - changed.y) / changed.height,
    ),
  ).toBeLessThan(0.003);
  box = changed;
  await page.mouse.wheel(0, 80);
  await expect
    .poll(async () =>
      Math.abs((await paper.boundingBox()).width / box.width - 0.975),
    )
    .toBeLessThan(0.001);
  box = await paper.boundingBox();
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 45);
  await page.keyboard.up("Shift");
  await expect
    .poll(async () => Math.round((await paper.boundingBox()).x - box.x))
    .toBe(-45);
  await page
    .getByRole("button", { name: "Yakınlaştırma seçenekleri", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Tuvali ekrana sığdır", exact: true })
    .click();
  box = await paper.boundingBox();
  const center = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.45 };
  await page.mouse.move(center.x, center.y);
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(center.x + 45, center.y + 30, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect
    .poll(async () => Math.round((await paper.boundingBox()).x - box.x))
    .toBe(45);
  expect((await draft()).faces.front).toEqual(original);
  box = await paper.boundingBox();
  await page.mouse.move(center.x + 45, center.y + 30);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(center.x + 70, center.y + 45, { steps: 4 });
  await page.mouse.up({ button: "middle" });
  await expect
    .poll(async () => Math.round((await paper.boundingBox()).x - box.x))
    .toBe(25);
  expect((await draft()).faces.front).toEqual(original);
  await page
    .getByRole("button", { name: "Yakınlaştırma seçenekleri", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Tuvali ekrana sığdır", exact: true })
    .click();
  box = await paper.boundingBox();
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  const client = await context.newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: cx - 35, y: cy, id: 1 }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: cx - 35, y: cy, id: 1 },
      { x: cx + 35, y: cy, id: 2 },
    ],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: cx - 55, y: cy + 15, id: 1 },
      { x: cx + 75, y: cy + 15, id: 2 },
    ],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(async () => (await paper.boundingBox()).width)
    .toBeGreaterThan(box.width * 1.5);
  await page.waitForTimeout(750);
  expect((await draft()).faces.front).toEqual(original);
  await page
    .getByRole("button", { name: "Yakınlaştırma seçenekleri", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Tuvali ekrana sığdır", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Rotate canvas 90 degrees", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await paper.boundingBox()).width / (await paper.boundingBox()).height,
    )
    .toBeGreaterThan(1.49);
  await page
    .getByRole("button", { name: "Yakınlaştırma seçenekleri", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Tuvali ekrana sığdır", exact: true })
    .click();
  // Keyboard shortcuts act only in the focused editor, preserving browser/page controls.
  const art = await page.locator(".design-paper").boundingBox();
  await page.mouse.click(art.x + art.width * 0.5, art.y + art.height * 0.45);
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => (await draft()).faces.front[0].x)
    .toBe(original[0].x + 1);
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await draft()).faces.front[0].x)
    .toBe(original[0].x);
  await page.keyboard.press("Control+y");
  await expect
    .poll(async () => (await draft()).faces.front[0].x)
    .toBe(original[0].x + 1);
  await expect(page.locator(".canvas-loading")).toBeHidden();
  await page.getByRole("button", { name: /Layers 1/ }).click();
  await page.locator(".online-layer-list button").first().click();
  await expect(page.locator(".selection-inspector")).toHaveCount(1);
  await page.keyboard.press("Control+d");
  await expect.poll(async () => (await draft()).faces.front.length).toBe(2);
  await page.keyboard.press("Escape");
  await expect(page.locator(".online-selection-floating")).toHaveCount(0);
  await page.evaluate(() => {
    document.activeElement?.blur();
    document.body.focus();
  });
  const untouched = JSON.stringify((await draft()).faces);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(750);
  expect(JSON.stringify((await draft()).faces)).toBe(untouched);
  // Configure stores preview choices only on Apply; Discard/Escape are transactional.
  const preview = page.locator(".preview-render");
  const config = page.getByRole("button", { name: "Config", exact: true });
  await config.click();
  let dialog = page.getByRole("dialog", { name: "Configure", exact: true });
  await dialog
    .getByRole("group", { name: "Material", exact: true })
    .getByRole("radio", { name: "Kraft", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(preview).toHaveAttribute("data-substrate", "white");
  await config.click();
  await dialog
    .getByRole("group", { name: "Finishing", exact: true })
    .getByRole("radio", { name: "Gloss", exact: true })
    .check();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(preview).toHaveAttribute("data-finishing", "matte");
  const beforeRender = JSON.stringify((await draft()).faces);
  const variants = [
    ["White film", "Full Color", "Gloss", "white", "color", "gloss"],
    ["White film", "Full Color", "Matte", "white", "color", "matte"],
    ["White film", "Full Color", "Blank", "white", "color", "none"],
    ["Kraft", "Full Color", "Gloss", "kraft", "color", "gloss"],
    ["Metallic", "Full Color", "Gloss", "metallic", "color", "gloss"],
    ["White film", "Black", "Gloss", "white", "black", "gloss"],
    ["White film", "Blank", "Gloss", "white", "blank", "gloss"],
  ];
  const hashes = [];
  for (const [
    material,
    print,
    finish,
    substrate,
    printMode,
    finishing,
  ] of variants) {
    await config.click();
    await dialog
      .getByRole("group", { name: "Material", exact: true })
      .getByRole("radio", { name: material, exact: true })
      .check();
    await dialog
      .getByRole("group", { name: "Print", exact: true })
      .getByRole("radio", { name: print, exact: true })
      .check();
    await dialog
      .getByRole("group", { name: "Finishing", exact: true })
      .getByRole("radio", { name: finish, exact: true })
      .check();
    await dialog.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(preview).toHaveAttribute("data-finishing", finishing);
    await expect(preview).toHaveAttribute("data-substrate", substrate);
    await expect(preview).toHaveAttribute("data-print-mode", printMode);
    await expect
      .poll(async () => (await draft()).presentation)
      .toMatchObject({ finishing, substrate, printMode });
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    const png = await preview
      .locator("canvas")
      .evaluate((c) => c.toDataURL("image/png"));
    hashes.push(createHash("sha256").update(png).digest("hex"));
    expect(JSON.stringify((await draft()).faces)).toBe(beforeRender);
  }
  expect(new Set(hashes).size).toBe(7);
  await page.reload();
  await expect(page.locator(".canvas-loading")).toBeHidden();
  await expect(preview).toHaveAttribute("data-print-mode", "blank");
  await page.setViewportSize({ width: 982, height: 1034 });
  const boxOf = (selector) => page.locator(selector).first().boundingBox();
  await expect
    .poll(async () => Math.round((await boxOf(".design-canvas-dock")).width))
    .toBe(419);
  await expect
    .poll(async () => Math.round((await boxOf(".online-preview")).height))
    .toBe(280);
  expect(Math.round((await boxOf(".online-rail")).height)).toBe(366);
  expect(Math.round((await boxOf(".online-save button")).width)).toBe(250);
  await mkdir("test-results/screenshots", { recursive: true });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Şekiller", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/screenshots/online-design-proportions.png",
  });
  await config.click();
  await expect
    .poll(async () =>
      Math.round((await boxOf(".configure-illustration")).width),
    )
    .toBe(96);
  await page.screenshot({
    path: "test-results/screenshots/online-design-configure.png",
  });
  await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Ürün ayarlarını aç veya kapat", exact: true })
    .click();
  await config.click();
  await expect(dialog).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await dialog
    .getByRole("group", { name: "Finishing", exact: true })
    .getByRole("radio", { name: "Matte", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(preview).toHaveAttribute("data-finishing", "matte");
  expect(errors).toEqual([]);
  console.log(
    "Gesture checks passed: cursor-anchored ctrl-wheel zoom; plain wheel zoom; Shift-wheel/Space/middle-button pan; two-touch pinch/pan without artwork mutation; 90-degree fitting; scoped shortcuts; transactional Configure; seven distinct renders; reload; desktop/mobile proportions.",
  );
} finally {
  await browser.close();
}
