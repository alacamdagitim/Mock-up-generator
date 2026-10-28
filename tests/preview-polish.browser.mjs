// Public UI + real WebGL checks. Isolated storage, no production debug hooks.
import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { blankDesign, DEFAULT_PRESENTATION } from "../shared/schema.mjs";

const base = process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184";
const output = "test-results/preview-polish";
const storageKey = "alacam:test:preview-polish";
const fixture = blankDesign();
fixture.name = "BOTANİK · Önizleme ince ayarı";
fixture.background = "#f1ede2";
fixture.presentation = {
  ...DEFAULT_PRESENTATION,
  finishing: "matte",
  substrate: "white",
  printMode: "color",
  background: "#dedcd7",
  backgroundStyle: "solid",
  inflate: 100,
};
const shape = (id, name, values) => ({
  id,
  name,
  kind: "rect",
  x: 35,
  y: 105,
  width: 530,
  height: 730,
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  fill: "#164d3c",
  ...values,
});
const text = (id, name, values) =>
  shape(id, name, {
    kind: "text",
    x: 65,
    y: 230,
    width: 470,
    height: 90,
    text: "BOTANİK",
    fontFamily: "DM Sans",
    fontSize: 68,
    fontWeight: "bold",
    textAlign: "center",
    fill: "#fff8df",
    ...values,
  });
fixture.faces.front = [
  shape("be4c31e3-0201-4b29-bced-d948f1f7ed01", "Yeşil etiket", {}),
  text("be4c31e3-0201-4b29-bced-d948f1f7ed02", "Marka", {}),
  text("be4c31e3-0201-4b29-bced-d948f1f7ed03", "Ürün adı", {
    y: 350,
    height: 120,
    fontSize: 37,
    fontWeight: "normal",
    text: "GÜNLÜK RİTÜEL\nDOĞAL BİTKİ ÇAYI",
  }),
  shape("be4c31e3-0201-4b29-bced-d948f1f7ed04", "Alt bant", {
    y: 620,
    height: 215,
    fill: "#eac68e",
  }),
  text("be4c31e3-0201-4b29-bced-d948f1f7ed05", "Net miktar", {
    y: 690,
    fontSize: 42,
    text: "100 g",
    fill: "#164d3c",
  }),
];
fixture.faces.back = [
  shape("be4c31e3-0201-4b29-bced-d948f1f7ed06", "Arka etiket", {
    fill: "#eac68e",
  }),
  text("be4c31e3-0201-4b29-bced-d948f1f7ed07", "Arka marka", {
    fill: "#164d3c",
  }),
  text("be4c31e3-0201-4b29-bced-d948f1f7ed08", "Arka metin", {
    y: 370,
    fontSize: 31,
    fontWeight: "normal",
    text: "DOĞADAN GELEN\nBİR FİNCAN HUZUR",
    fill: "#164d3c",
  }),
];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1456, height: 1034 },
  hasTouch: true,
});
await mkdir(output, { recursive: true });
const summary = { passed: [], pageErrors: [], observations: {} };
const page = await context.newPage();
page.on("pageerror", (error) =>
  summary.pageErrors.push(error.stack || error.message),
);
await page.route("**/api/health", (route) =>
  route.fulfill({ json: { storageConfigured: false } }),
);
await context.addInitScript(
  ({ storageKey, fixture }) => {
    window.AlacamEditorConfig = {
      storageKey,
      libraryKey: `${storageKey}:library`,
    };
    if (!localStorage.getItem(storageKey))
      localStorage.setItem(storageKey, JSON.stringify(fixture));
    // Observe actual native contexts solely in the isolated test page.
    const contexts = [];
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      const result = original.apply(this, args);
      if (
        /^webgl2?$/.test(String(args[0])) &&
        result &&
        !contexts.includes(result)
      )
        contexts.push(result);
      return result;
    };
    window.__previewQAContexts = contexts;
  },
  { storageKey, fixture },
);
const preview = page.locator(".preview-render");
const canvas = preview.locator("canvas");
const dock = page.getByRole("toolbar", { name: "3D araçları", exact: true });
const png = () => canvas.evaluate((c) => c.toDataURL("image/png"));
const hash = async () =>
  createHash("sha256")
    .update(await png())
    .digest("hex");
const settle = () => page.waitForTimeout(220);
const pressZoom = async (button, count) => {
  for (let i = 0; i < count; i++)
    if (await button.isEnabled()) await button.click();
};
const ready = async (scope = page) => {
  await expect(scope.locator(".canvas-loading")).toBeHidden();
  await expect(scope.locator(".render-loading")).toBeHidden();
  await expect(scope.locator(".preview-render canvas")).toBeVisible({
    timeout: 45_000,
  });
};
const view = async (name = "Front") => {
  const trigger = dock.getByRole("button", {
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
const setRange = async (locator, value) => {
  await locator.evaluate((input, next) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(input, String(next));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await settle();
};
const point = async () => {
  const box = await canvas.boundingBox();
  return { x: box.x + box.width * 0.53, y: box.y + box.height * 0.47 };
};
const drag = async (dx, dy, release = true) => {
  const p = await point();
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + dx, p.y + dy, { steps: 1 });
  await settle();
  if (release) {
    await page.mouse.up();
    await settle();
  }
};
const difference = async (a, b) =>
  page.evaluate(
    async ({ a, b }) => {
      const images = await Promise.all(
        [a, b].map(
          (src) =>
            new Promise((resolve, reject) => {
              const image = new Image();
              image.onload = () => resolve(image);
              image.onerror = reject;
              image.src = src;
            }),
        ),
      );
      if (
        images[0].width !== images[1].width ||
        images[0].height !== images[1].height
      )
        throw new Error(
          "Compared preview images must have the same dimensions",
        );
      const probe = document.createElement("canvas");
      probe.width = images[0].width;
      probe.height = images[0].height;
      const ctx = probe.getContext("2d");
      const pixels = images.map((image) => {
        ctx.clearRect(0, 0, probe.width, probe.height);
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, probe.width, probe.height).data;
      });
      let total = 0;
      let changed = 0;
      let shadowTotal = 0;
      let shadowN = 0;
      for (let i = 0; i < pixels[0].length; i += 4) {
        const delta =
          Math.abs(pixels[0][i] - pixels[1][i]) +
          Math.abs(pixels[0][i + 1] - pixels[1][i + 1]) +
          Math.abs(pixels[0][i + 2] - pixels[1][i + 2]) +
          Math.abs(pixels[0][i + 3] - pixels[1][i + 3]);
        total += delta;
        if (delta > 12) changed++;
        const y = Math.floor(i / 4 / probe.width);
        if (y > probe.height * 0.62 && y < probe.height * 0.9) {
          shadowTotal += delta;
          shadowN++;
        }
      }
      return {
        mean: total / pixels[0].length,
        changedFraction: changed / (pixels[0].length / 4),
        lowerMean: shadowTotal / (shadowN * 4),
      };
    },
    { a, b },
  );
const draft = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
const saveImage = async (name) => {
  await page.mouse.move(2, 65);
  await settle();
  await page.screenshot({ path: `${output}/${name}.png` });
  const data = await png();
  await writeFile(
    `${output}/${name}-product.png`,
    Buffer.from(data.split(",")[1], "base64"),
  );
};

try {
  await page.goto(base);
  await ready();
  await page
    .getByRole("group", { name: "Çalışma görünümü", exact: true })
    .getByRole("button", { name: "3D", exact: true })
    .click();
  await settle();

  // Toolbar and wheel must reach the same physical zoom limits, not separate scales.
  const zoomIn = dock.getByRole("button", {
    name: "3B yakınlaştır",
    exact: true,
  });
  const zoomOut = dock.getByRole("button", {
    name: "3B uzaklaştır",
    exact: true,
  });
  await view();
  await pressZoom(zoomIn, 48);
  await settle();
  const closestButton = await hash();
  const closestImage = await png();
  await pressZoom(zoomIn, 4);
  await settle();
  expect(
    await hash(),
    "extra toolbar zoom-in presses stop at the near limit",
  ).toBe(closestButton);
  await view();
  let p = await point();
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, -100000);
  await settle();
  expect(
    (await difference(closestImage, await png())).mean,
    "wheel and toolbar share their near limit",
  ).toBeLessThan(0.025);
  await pressZoom(zoomOut, 64);
  await settle();
  const farthestButton = await hash();
  const farthestImage = await png();
  await pressZoom(zoomOut, 4);
  await settle();
  expect(
    await hash(),
    "extra toolbar zoom-out presses stop at the far limit",
  ).toBe(farthestButton);
  await view();
  p = await point();
  await page.mouse.move(p.x, p.y);
  await page.mouse.wheel(0, 100000);
  await settle();
  expect(
    (await difference(farthestImage, await png())).mean,
    "wheel and toolbar share their far limit",
  ).toBeLessThan(0.025);
  summary.passed.push(
    "Toolbar and wheel share finite, stable near/far zoom limits",
  );

  // A contact shadow cannot jump to its new footprint only after pointerup.
  await view("Perspective");
  const beforeDrag = await hash();
  await drag(65, 0, false);
  const held = await png();
  expect(createHash("sha256").update(held).digest("hex")).not.toBe(beforeDrag);
  await page.mouse.up();
  await settle();
  const released = await png();
  const dragDifference = await difference(held, released);
  summary.observations.pointerReleaseDifference = dragDifference;
  expect(
    dragDifference.mean,
    "rotation and contact shadow already match the released image while dragging",
  ).toBeLessThan(0.025);
  summary.passed.push(
    "The real contact shadow follows a held product drag without a release-frame jump",
  );

  // Exercise reversible changes after the user has changed camera zoom and pan.
  await page.getByRole("button", { name: "Yerleşim", exact: true }).click();
  await page
    .getByRole("button", { name: "İkili yerleşimini uygula", exact: true })
    .click();
  await view("Perspective");
  await zoomIn.click();
  await zoomIn.click();
  const menuTrigger = dock.getByRole("button", {
    name: "3D görünüm seçenekleri",
    exact: true,
  });
  await menuTrigger.click();
  await page.getByRole("button", { name: "Pan 3D", exact: true }).click();
  await menuTrigger.click();
  await drag(44, 20);
  const originalCamera = await png();
  const spacing = page.getByRole("slider", {
    name: "Yerleşim aralığı",
    exact: true,
  });
  await setRange(spacing, 1.15);
  expect(await hash()).not.toBe(
    createHash("sha256").update(originalCamera).digest("hex"),
  );
  await setRange(spacing, 1);
  const revertedSpacing = await difference(originalCamera, await png());
  summary.observations.revertedSpacingDifference = revertedSpacing;
  expect(
    revertedSpacing.mean,
    "spacing round trip preserves the user's camera angle, pan and zoom",
  ).toBeLessThan(0.025);
  const inflate = dock.getByRole("slider", {
    name: "Paket dolgunluğu",
    exact: true,
  });
  await setRange(inflate, 42);
  await setRange(inflate, 100);
  expect(
    (await difference(originalCamera, await png())).mean,
    "inflate round trip preserves the user's view",
  ).toBeLessThan(0.025);
  await page.setViewportSize({ width: 1320, height: 950 });
  await settle();
  await page.setViewportSize({ width: 1456, height: 1034 });
  await settle();
  expect(
    (await difference(originalCamera, await png())).mean,
    "resize round trip preserves the user's view",
  ).toBeLessThan(0.025);
  summary.passed.push(
    "Spacing, inflate and resize round trips preserve user zoom/pan/orientation",
  );

  await menuTrigger.click();
  await page.getByRole("button", { name: "Rotate 3D", exact: true }).click();
  await menuTrigger.click();
  await page
    .getByRole("button", { name: "Tek ürün yerleşimini uygula", exact: true })
    .click();
  await view();
  const client = await context.newCDPSession(page);
  p = await point();
  const touch = async (type, touchPoints) =>
    client.send("Input.dispatchTouchEvent", { type, touchPoints });
  const pinch = async () => {
    await touch("touchStart", [{ x: p.x - 30, y: p.y, id: 11 }]);
    await touch("touchStart", [
      { x: p.x - 30, y: p.y, id: 11 },
      { x: p.x + 30, y: p.y, id: 12 },
    ]);
    await touch("touchMove", [
      { x: p.x - 42, y: p.y, id: 11 },
      { x: p.x + 42, y: p.y, id: 12 },
    ]);
    await settle();
  };
  await pinch();
  const pinched = await png();
  // This Chromium accepts a partial touchEnd with the RELEASED point. Native
  // event logging confirms pointerup for finger 12, while finger 11 stays down.
  await touch("touchEnd", [{ x: p.x + 42, y: p.y, id: 12 }]);
  await settle();
  const singleBefore = await png();
  expect(
    (await difference(pinched, singleBefore)).mean,
    "lifting a second finger causes no rotation jump",
  ).toBeLessThan(0.025);
  await touch("touchMove", [{ x: p.x - 34, y: p.y, id: 11 }]);
  await settle();
  const singleAfter = await png();
  const resumed = await difference(singleBefore, singleAfter);
  summary.observations.twoToOneDifference = resumed;
  expect(
    resumed.changedFraction,
    "the remaining finger resumes rotation",
  ).toBeGreaterThan(0.0001);
  await touch("touchEnd", []);
  await settle();
  // Compare with an independent mouse drag after the same pinch. This checks
  // the actual angle without a fragile percentage-of-image motion heuristic.
  await view();
  await pinch();
  expect((await difference(pinched, await png())).mean).toBeLessThan(0.025);
  await touch("touchEnd", []);
  await settle();
  await drag(8, 0);
  const referenceDifference = await difference(singleAfter, await png());
  summary.observations.touchMouseReferenceDifference = referenceDifference;
  expect(
    referenceDifference.mean,
    "remaining-finger motion matches an independent 8 px mouse rotation",
  ).toBeLessThan(0.025);
  // Native touchCancel exercises pointer capture cleanup, followed by a fresh mouse drag.
  await touch("touchStart", [{ x: p.x, y: p.y, id: 21 }]);
  await touch("touchCancel", []);
  await settle();
  const cancelled = await hash();
  await drag(16, 0);
  expect(
    await hash(),
    "cancelled/lost pointers do not leave a stuck drag",
  ).not.toBe(cancelled);
  summary.passed.push(
    "Pinch → one-finger rotation stays continuous; cancelled pointers release the gesture",
  );
  expect((await draft()).faces).toEqual(fixture.faces);

  const interactionMode = async (name) => {
    if ((await menuTrigger.getAttribute("aria-expanded")) !== "true")
      await menuTrigger.click();
    await page.getByRole("button", { name, exact: true }).click();
    await menuTrigger.click();
  };
  await view();
  await interactionMode("Pan 3D");
  await drag(44, 20);
  const panReference = await png();
  await interactionMode("Rotate 3D");
  for (const modifier of ["Control", "Meta", "Shift"]) {
    await view();
    await page.keyboard.down(modifier);
    await drag(44, 20);
    await page.keyboard.up(modifier);
    expect(
      (await difference(panReference, await png())).mean,
      `${modifier}+left drag pans exactly once without rotating the product`,
    ).toBeLessThan(0.025);
  }
  summary.passed.push(
    "Ctrl/Meta/Shift drags match the independent Pan tool without duplicate product rotation",
  );

  const config = page.getByRole("button", { name: "Config", exact: true });
  const configToggle = page.getByRole("button", {
    name: "Ürün ayarlarını aç veya kapat",
    exact: true,
  });
  for (const [material, finishing, name] of [
    ["White film", "Matte", "botanik-matte"],
    ["White film", "Gloss", "botanik-gloss"],
    ["Kraft", "Matte", "botanik-kraft"],
  ]) {
    if (!(await config.isVisible())) await configToggle.click();
    await config.click();
    const dialog = page.getByRole("dialog", { name: "Configure", exact: true });
    await dialog
      .getByRole("group", { name: "Material", exact: true })
      .getByRole("radio", { name: material, exact: true })
      .check();
    await dialog
      .getByRole("group", { name: "Finishing", exact: true })
      .getByRole("radio", { name: finishing, exact: true })
      .check();
    await dialog.getByRole("button", { name: "Apply", exact: true }).click();
    if ((await configToggle.getAttribute("aria-expanded")) === "true")
      await configToggle.click();
    await view("Perspective");
    await saveImage(name);
  }

  // Hold the first real font responses long enough to expose the original
  // fallback-raster bug. Font availability alone cannot prove texture fidelity.
  const fontContext = await browser.newContext({
    viewport: { width: 1456, height: 1034 },
  });
  const fontPage = await fontContext.newPage();
  fontPage.on("pageerror", (error) =>
    summary.pageErrors.push(error.stack || error.message),
  );
  const fontKey = `${storageKey}:cold-font`;
  const fontFixture = {
    ...fixture,
    presentation: { ...fixture.presentation, layout: "single", spacing: 1 },
    faces: {
      front: fixture.faces.front.slice(0, 2),
      back: [],
    },
  };
  await fontContext.addInitScript(
    ({ fontKey, fontFixture }) => {
      window.AlacamEditorConfig = { storageKey: fontKey };
      localStorage.setItem(fontKey, JSON.stringify(fontFixture));
    },
    { fontKey, fontFixture },
  );
  await fontPage.route("**/api/health", (route) =>
    route.fulfill({ json: { storageConfigured: false } }),
  );
  let delayedFonts = 0;
  await fontPage.route("**/*.woff2*", async (route) => {
    delayedFonts++;
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await fontPage.goto(base);
  await ready(fontPage);
  await fontPage.evaluate(() => document.fonts.ready);
  await fontPage.waitForTimeout(220);
  expect(
    delayedFonts,
    "cold startup exercised real delayed font downloads",
  ).toBeGreaterThan(0);
  const fontCanvas = fontPage.locator(".preview-render canvas");
  const fontPng = () => fontCanvas.evaluate((c) => c.toDataURL("image/png"));
  const firstFontTexture = await fontPng();
  await fontPage.getByRole("button", { name: /Layers 2/ }).click();
  await fontPage
    .locator(".online-layer-list")
    .getByRole("button", { name: "Marka", exact: true })
    .click();
  const fontSize = fontPage.getByRole("spinbutton", {
    name: "Yazı boyutu",
    exact: true,
  });
  await fontSize.fill("69");
  await fontPage.waitForTimeout(220);
  await fontSize.fill("68");
  await fontPage.waitForTimeout(220);
  const recreatedFontTexture = await fontPng();
  const coldFontDifference = await difference(
    firstFontTexture,
    recreatedFontTexture,
  );
  summary.observations.coldFontTextureDifference = coldFontDifference;
  expect(
    coldFontDifference.mean,
    "the first delayed-font 3D texture equals the recreated texture after the font is available",
  ).toBeLessThan(0.025);
  const fontSelect = fontPage.getByRole("combobox", {
    name: "Font",
    exact: true,
  });
  await fontSelect.evaluate((select) => {
    for (const family of ["Georgia", "Arial", "DM Sans"]) {
      select.value = family;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await fontSize.fill("73");
  await expect(fontSelect).toHaveValue("DM Sans");
  await expect
    .poll(() =>
      fontPage.evaluate((key) => {
        const design = JSON.parse(localStorage.getItem(key));
        const brand = design.faces.front.find((item) => item.name === "Marka");
        return { font: brand.fontFamily, size: brand.fontSize };
      }, fontKey),
    )
    .toEqual({ font: "DM Sans", size: 73 });
  await fontSize.fill("68");
  await fontPage.waitForTimeout(220);
  expect(
    (await difference(firstFontTexture, await fontPng())).mean,
    "rapid font changes preserve the final family and do not restore stale sizing",
  ).toBeLessThan(0.025);
  await fontPage.screenshot({ path: `${output}/cold-font-first-texture.png` });
  await fontContext.close();
  summary.passed.push(
    "Delayed cold font downloads produce the correct first 3D texture; rapid font changes preserve latest sizing",
  );

  // A fresh storefront page tests real mount/unmount and actual context release.
  const lifecycle = await context.newPage();
  lifecycle.on("pageerror", (error) => summary.pageErrors.push(error.message));
  await lifecycle.route("**/api/health", (route) =>
    route.fulfill({ json: { storageConfigured: false } }),
  );
  await lifecycle.goto(`${base}/tests/fixtures/shopify-launcher.html`);
  const editor = lifecycle.getByRole("dialog", {
    name: "Alaçam Tasarım Editörü",
    exact: true,
  });
  const activeContexts = () =>
    lifecycle.evaluate(
      () =>
        window.__previewQAContexts.filter((ctx) => !ctx.isContextLost()).length,
    );
  for (let i = 0; i < 4; i++) {
    await lifecycle
      .getByRole("button", { name: "Design online · Beyaz", exact: true })
      .click();
    await ready(editor);
    expect(
      await activeContexts(),
      "only one native 3D context is live per open editor",
    ).toBe(1);
    await editor
      .getByRole("button", { name: "Editörü kapat", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    await expect.poll(activeContexts, { timeout: 10_000 }).toBe(0);
  }
  await lifecycle.close();
  summary.passed.push(
    "Four Shopify open/close cycles release native WebGL contexts instead of accumulating them",
  );
  expect(summary.pageErrors).toEqual([]);
  await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(summary.passed.join("\n"));
} catch (error) {
  summary.failure = String(error);
  await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
