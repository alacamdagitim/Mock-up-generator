// Local UI regression tests. All browser storage/API calls are isolated test data.
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
const base = process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
await mkdir("test-results/screenshots", { recursive: true });
const errors = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/health", (route) =>
  route.fulfill({ json: { storageConfigured: false } }),
);
const draft = () =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("alacam:draft:v1:doypack") || "null"),
  );
const rail = page.getByRole("navigation", { name: "Online tasarım araçları" });
const modes = page.getByRole("group", { name: "Çalışma görünümü" });
const dock = page.getByRole("toolbar", { name: "Tuval araçları" });
const screenshot = async (name) => {
  await page.mouse.move(5, 65);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  return page.screenshot({
    path: `test-results/screenshots/online-design-${name}.png`,
  });
};
try {
  await page.goto(base);
  await expect(page.locator(".canvas-loading")).toBeHidden();
  await expect(page.locator(".preview-render canvas")).toHaveCount(1);
  await expect(rail.getByRole("button")).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "Modeller", exact: true }),
  ).toHaveCount(0);
  await screenshot("empty");
  await modes.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.locator(".design-workbench")).toBeHidden();
  await expect(page.locator(".online-panel")).toBeHidden();
  await expect(page.locator(".online-preview")).toBeVisible();
  await modes.getByRole("button", { name: "2D", exact: true }).click();
  await page
    .getByRole("button", { name: "Botanik örneğini uygula", exact: true })
    .click();
  await expect.poll(async () => (await draft())?.faces.front.length).toBe(6);
  await page
    .getByRole("button", { name: "Bildirimi kapat", exact: true })
    .click();
  await screenshot("2d");
  await dock.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect.poll(async () => (await draft())?.faces.front.length).toBe(0);
  await dock.getByRole("button", { name: "Yinele", exact: true }).click();
  await expect.poll(async () => (await draft())?.faces.front.length).toBe(6);
  await dock.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect.poll(async () => (await draft())?.faces.front.length).toBe(0);
  await rail.getByRole("button", { name: "Yüklemeler", exact: true }).click();
  await page
    .locator('input[accept=".png,.jpg,.jpeg,.svg"]')
    .setInputFiles("tests/fixtures/logo.svg");
  await expect(
    page.getByRole("button", { name: "logo.svg tasarıma ekle", exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await draft())?.faces.front.length).toBe(1);
  await page
    .getByRole("button", { name: "More object tools", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "Döndürme", exact: true })
    .fill("17");
  await expect
    .poll(async () => (await draft())?.faces.front[0]?.angle)
    .toBe(17);
  await dock.getByRole("button", { name: "Geri al", exact: true }).click();
  await expect.poll(async () => (await draft())?.faces.front[0]?.angle).toBe(0);
  await dock.getByRole("button", { name: "Yinele", exact: true }).click();
  await expect
    .poll(async () => (await draft())?.faces.front[0]?.angle)
    .toBe(17);
  const zoom = await dock.locator("output").textContent();
  await dock
    .getByRole("button", { name: "Tuvali yakınlaştır", exact: true })
    .click();
  await expect(dock.locator("output")).not.toHaveText(zoom);
  await dock
    .getByRole("button", { name: "Tuvali kaydır", exact: true })
    .click();
  const viewport = await page.locator(".design-viewport").boundingBox();
  const oldTransform = await page
    .locator(".design-paper")
    .getAttribute("style");
  await page.mouse.move(viewport.x + 25, viewport.y + 45);
  await page.mouse.down();
  await page.mouse.move(viewport.x + 90, viewport.y + 95, { steps: 6 });
  await page.mouse.up();
  expect(await page.locator(".design-paper").getAttribute("style")).not.toBe(
    oldTransform,
  );
  await dock
    .getByRole("button", { name: "Yakınlaştırma seçenekleri", exact: true })
    .click();
  await dock
    .getByRole("menuitem", { name: "Tuvali ekrana sığdır", exact: true })
    .click();
  await dock.getByRole("button", { name: "Öğe seç", exact: true }).click();
  await dock
    .getByRole("button", { name: "Görünüm seçenekleri", exact: true })
    .click();
  await dock
    .getByRole("checkbox", { name: "Show bleedline", exact: true })
    .uncheck();
  await expect(page.locator(".guide-overlay")).toHaveCount(0);
  await dock
    .getByRole("checkbox", { name: "Show bleedline", exact: true })
    .check();
  await dock
    .getByRole("button", { name: "Görünüm seçenekleri", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Baskı yüzü", exact: true })
    .selectOption("back");
  await expect(page.locator(".canvas-loading")).toBeHidden();
  await rail.getByRole("button", { name: "Yazı", exact: true }).click();
  await page.getByRole("button", { name: "Yazı ekle", exact: true }).click();
  await page
    .getByRole("button", { name: "More object tools", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Yazı içeriği", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Yazı içeriği", exact: true })
    .fill("ALAÇAM ARKA YÜZ");
  await expect
    .poll(async () => (await draft())?.faces.back[0]?.text)
    .toBe("ALAÇAM ARKA YÜZ");
  expect((await draft()).faces.front).toHaveLength(1);
  await rail.getByRole("button", { name: "Arka plan", exact: true }).click();
  await page
    .getByRole("button", { name: "Ambalaj rengi #efe3cf", exact: true })
    .click();
  await expect.poll(async () => (await draft())?.background).toBe("#efe3cf");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(
    page.getByText("Bu cihazda kaydedildi. Sunucu depolaması bağlı değil.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Bildirimi kapat", exact: true })
    .click();
  await page
    .getByRole("button", { name: "İndirme ve JSON araçları", exact: true })
    .click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Düzenlenebilir JSON", exact: true })
    .click();
  const file = await downloaded;
  const exported = JSON.parse(await readFile(await file.path(), "utf8"));
  expect(exported.faces.front).toHaveLength(1);
  expect(exported.faces.back).toHaveLength(1);
  await page.reload();
  await expect(page.locator(".canvas-loading")).toBeHidden();
  await rail.getByRole("button", { name: "Yüklemeler", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "logo.svg tasarıma ekle", exact: true }),
  ).toBeVisible();
  await page
    .locator('input[accept=".png,.jpg,.jpeg,.svg"]')
    .setInputFiles("tests/fixtures/fake.png");
  await expect(page.getByRole("alert")).toContainText(
    "Dosya içeriği PNG veya JPG değil.",
  );
  expect((await draft()).faces.front).toHaveLength(1);
  await page
    .getByRole("button", { name: "Bildirimi kapat", exact: true })
    .click();
  await rail.getByRole("button", { name: "Yerleşim", exact: true }).click();
  await expect(page.locator(".layout-grid > button")).toHaveCount(11);
  for (const name of [
    "Tek ürün",
    "Ön ve arka",
    "İkili",
    "Üçlü seri",
    "Yelpaze",
    "Kademeli",
    "Vitrin",
    "Katalog",
  ]) {
    await page
      .getByRole("button", { name: `${name} yerleşimini uygula`, exact: true })
      .click();
    await rail.getByRole("button", { name: "Yerleşim", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Ön ve arka yerleşimini uygula", exact: true })
    .click();
  await expect(page.locator(".preview-render")).toHaveAttribute(
    "data-layout",
    "front-back",
  );
  await page
    .getByRole("slider", { name: "Yerleşim aralığı", exact: true })
    .press("Home");
  for (let step = 0; step < 9; step++)
    await page
      .getByRole("slider", { name: "Yerleşim aralığı", exact: true })
      .press("ArrowRight");
  await expect
    .poll(async () => (await draft())?.presentation?.spacing)
    .toBe(1.25);
  await screenshot("layout");
  await page.reload();
  await expect(page.locator(".canvas-loading")).toBeHidden();
  await rail.getByRole("button", { name: "Yerleşim", exact: true }).click();
  await expect(page.locator(".preview-render")).toHaveAttribute(
    "data-layout",
    "front-back",
  );
  await expect(
    page.getByRole("slider", { name: "Yerleşim aralığı", exact: true }),
  ).toHaveValue("1.25");
  await modes.getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.locator(".preview-render")).toHaveAttribute(
    "data-layout",
    "single",
  );
  expect((await draft()).presentation.layout).toBe("front-back");
  await rail.getByRole("button", { name: "Yerleşim", exact: true }).click();
  await expect(page.locator(".preview-render")).toHaveAttribute(
    "data-layout",
    "front-back",
  );
  await page
    .getByRole("button", { name: "Tek ürün yerleşimini uygula", exact: true })
    .click();
  await modes.getByRole("button", { name: "2D", exact: true }).click();
  await rail.getByRole("button", { name: "Yüklemeler", exact: true }).click();
  await page.setViewportSize({ width: 982, height: 1034 });
  await expect
    .poll(async () => {
      const panel = await page.locator(".online-panel").boundingBox();
      const paper = await page.locator(".design-paper").boundingBox();
      return paper.x >= panel.x + panel.width;
    })
    .toBe(true);
  await screenshot("tablet");
  await modes.getByRole("button", { name: "3D", exact: true }).click();
  await expect(
    modes.getByRole("button", { name: "3D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await screenshot("3d");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".online-preview")).toBeVisible();
  await rail.getByRole("button", { name: "Yerleşim", exact: true }).click();
  await expect(page.locator(".layout-grid")).toBeVisible();
  await page
    .getByRole("button", { name: "Katalog yerleşimini uygula", exact: true })
    .click();
  await expect(page.locator(".online-panel")).toBeHidden();
  await expect(page.locator(".preview-render")).toHaveAttribute(
    "data-layout",
    "catalog",
  );
  await screenshot("mobile-layout");
  await screenshot("mobile-3d");
  await page
    .getByRole("button", { name: "Ürün ayarlarını aç veya kapat", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Ürün ayarları", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ürün ayarlarını aç veya kapat", exact: true })
    .click();
  await modes.getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.locator(".design-workbench")).toBeVisible();
  await expect(
    modes.getByRole("button", { name: "2D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await screenshot("mobile-2d");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Editörü kapat", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Online tasarla", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Online tasarla", exact: true })
    .click();
  await expect(page.locator(".online-app")).toBeVisible();
  await context.close();

  const serverContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await serverContext.addInitScript(() => {
    window.AlacamEditorConfig = {
      productId: "100",
      productTitle: "Test Doypack",
      variants: [{ id: 10001, title: "Beyaz", available: true }],
      cartRoot: "/qa/",
    };
    window.addEventListener(
      "alacam:design-saved",
      (event) => (window.testSavedEvent = event.detail),
    );
  });
  const serverPage = await serverContext.newPage();
  serverPage.on("pageerror", (error) => errors.push(error.message));
  await serverPage.route("**/api/health", (route) =>
    route.fulfill({ json: { storageConfigured: true } }),
  );
  const savedRequests = [];
  await serverPage.route("**/api/designs", (route) => {
    savedRequests.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        id: "qa-design",
        designUrl: `${base}/qa/design.json`,
        previewUrl: `${base}/qa/preview.png`,
      },
    });
  });
  let cartItem;
  await serverPage.route("**/qa/cart/add.js", (route) => {
    cartItem = route.request().postDataJSON().items[0];
    return route.fulfill({ json: { items: [cartItem] } });
  });
  await serverPage.route("**/qa/cart", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Test sepeti</h1>" }),
  );
  await serverPage.goto(base);
  await expect(serverPage.locator(".canvas-loading")).toBeHidden();
  await serverPage.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(
    serverPage.getByText("Cihaza ve sunucuya kaydedildi.", { exact: true }),
  ).toBeVisible();
  expect(await serverPage.evaluate(() => window.testSavedEvent.scope)).toBe(
    "server",
  );
  expect(savedRequests[0].design.schemaVersion).toBe(1);
  expect(savedRequests[0].preview.startsWith("data:image/png;base64,")).toBe(
    true,
  );
  await serverPage
    .getByRole("button", { name: "Tasarımla sepete ekle", exact: true })
    .click();
  await serverPage.waitForURL("**/qa/cart");
  expect(cartItem.id).toBe(10001);
  expect(cartItem.properties._alacam_design_id).toBe("qa-design");
  expect(JSON.stringify(cartItem)).not.toContain("data:image");
  await serverContext.close();
  const failureContext = await browser.newContext();
  const failurePage = await failureContext.newPage();
  failurePage.on("pageerror", (error) => errors.push(error.message));
  await failurePage.route("**/api/health", (route) =>
    route.fulfill({ json: { storageConfigured: true } }),
  );
  await failurePage.route("**/api/designs", (route) =>
    route.fulfill({ status: 503, json: { error: "Test sunucu hatası" } }),
  );
  await failurePage.goto(base);
  await expect(failurePage.locator(".canvas-loading")).toBeHidden();
  await failurePage
    .getByRole("button", { name: "Kaydet", exact: true })
    .click();
  await expect(failurePage.getByRole("alert")).toContainText(
    "Sunucu kaydı başarısız: Test sunucu hatası",
  );
  await expect(failurePage.locator(".online-app")).toBeVisible();
  await failureContext.close();

  const featureContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const featurePage = await featureContext.newPage();
  featurePage.on("pageerror", (error) => errors.push(error.message));
  await featurePage.route("**/api/health", (route) =>
    route.fulfill({ json: { storageConfigured: false } }),
  );
  await featurePage.goto(base);
  await expect(featurePage.locator(".canvas-loading")).toBeHidden();
  const featureDraft = () =>
    featurePage.evaluate(() =>
      JSON.parse(localStorage.getItem("alacam:draft:v1:doypack")),
    );
  const featureRail = featurePage.getByRole("navigation", {
    name: "Online tasarım araçları",
  });
  await featureRail
    .getByRole("button", { name: "Şekiller", exact: true })
    .click();
  for (const name of [
    "Line",
    "Dashed line",
    "Square",
    "Rounded square",
    "Pill",
    "Circle",
    "Triangle",
    "Star",
  ]) {
    await featurePage.getByRole("button", { name, exact: true }).click();
  }
  await expect
    .poll(async () => (await featureDraft()).faces.front.length)
    .toBe(8);
  await featurePage.reload();
  await expect(featurePage.locator(".canvas-loading")).toBeHidden();
  expect(
    (await featureDraft()).faces.front.map((e) => e.shape || e.kind),
  ).toEqual([
    "line",
    "dashed",
    "square",
    "rounded",
    "pill",
    "circle",
    "triangle",
    "star",
  ]);
  await featureRail
    .getByRole("button", { name: "Arka plan", exact: true })
    .click();
  await featurePage
    .getByRole("button", { name: "Garden pattern", exact: true })
    .click();
  await expect
    .poll(async () => (await featureDraft()).faces.front.length)
    .toBe(9);
  await featureRail
    .getByRole("button", { name: "Şekiller", exact: true })
    .click();
  await featurePage
    .getByRole("button", { name: "Keep dry", exact: true })
    .click();
  await expect
    .poll(async () => (await featureDraft()).faces.front.length)
    .toBe(10);
  await featureRail.getByRole("button", { name: "Yazı", exact: true }).click();
  await featurePage
    .getByRole("button", { name: "Yazı ekle", exact: true })
    .click();
  for (const name of ["Bold", "Italic", "Underline"])
    await featurePage.getByRole("button", { name, exact: true }).click();
  await featurePage
    .getByRole("button", { name: "More object tools", exact: true })
    .click();
  await featurePage
    .getByRole("slider", { name: "Opacity", exact: true })
    .fill("0.5");
  await featurePage
    .getByRole("button", { name: "Flip horizontally", exact: true })
    .click();
  await featurePage
    .getByRole("button", { name: "Flip vertically", exact: true })
    .click();
  await featurePage
    .getByRole("button", { name: "Duplicate", exact: true })
    .click();
  await expect
    .poll(async () => (await featureDraft()).faces.front.length)
    .toBe(12);
  await featurePage
    .getByRole("button", { name: "More object tools", exact: true })
    .click();
  await featurePage.getByRole("button", { name: "Lock", exact: true }).click();
  await expect
    .poll(async () => (await featureDraft()).faces.front.at(-1).locked)
    .toBe(true);
  await featurePage
    .getByRole("button", { name: "Seçili öğeyi sil", exact: true })
    .click();
  expect((await featureDraft()).faces.front.length).toBe(12);
  await featureRail.getByRole("button", { name: "Yazı", exact: true }).click();
  await featurePage.getByRole("button", { name: /Layers 12/ }).click();
  await featurePage.locator(".online-layer-list button").first().click();
  await featurePage
    .getByRole("button", { name: "More object tools", exact: true })
    .click();
  await featurePage
    .getByRole("button", { name: "Unlock", exact: true })
    .click();
  await expect
    .poll(async () => (await featureDraft()).faces.front.at(-1).locked)
    .toBe(false);

  const styled = (await featureDraft()).faces.front.at(-1);
  expect(styled).toMatchObject({
    fontWeight: "bold",
    fontStyle: "italic",
    underline: true,
    opacity: 0.5,
    flipX: true,
    flipY: true,
  });
  await featurePage.reload();
  await expect(featurePage.locator(".canvas-loading")).toBeHidden();
  expect((await featureDraft()).faces.front.at(-1)).toMatchObject(styled);
  await featureRail
    .getByRole("button", { name: "Şekiller", exact: true })
    .click();
  await featurePage.screenshot({
    path: "test-results/screenshots/online-design-shapes.png",
  });
  await featureRail
    .getByRole("button", { name: "Arka plan", exact: true })
    .click();
  await featurePage.screenshot({
    path: "test-results/screenshots/online-design-patterns.png",
  });
  await featureContext.close();
  expect(errors).toEqual([]);
  console.log(
    "Online Design checks passed: 2D/3D, presets, SVG, transform/history, zoom/pan, faces, text, background, device/server save, JSON, reload, errors, responsive layout, host callback and simulated Shopify cart.",
  );
} finally {
  await browser.close();
}
