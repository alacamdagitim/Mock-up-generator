// Public-UI regression checks against an isolated Vite storefront fixture.
// This test never attaches to user tabs and never writes to a real Shopify cart.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184";
const fixtureUrl = `${base}/tests/fixtures/shopify-launcher.html`;
const output = "test-results/shopify-launcher";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
await mkdir(output, { recursive: true });
const summary = { passed: [], pageErrors: [] };
let latestPage;

async function storefront(options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1456, height: 1034 },
    ...options,
  });
  const page = await context.newPage();
  latestPage = page;
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { storageConfigured: false } }),
  );
  page.on("pageerror", (error) => summary.pageErrors.push(error.message));
  return { context, page };
}

const editor = (page) =>
  page.getByRole("dialog", { name: "Alaçam Tasarım Editörü", exact: true });
const triggerA = (page) =>
  page.getByRole("button", { name: "Design online · Beyaz", exact: true });
const triggerB = (page) =>
  page.getByRole("button", { name: "Design online · Kraft", exact: true });
const app = (page) => editor(page).locator(".online-app");

async function ready(page) {
  await expect(editor(page)).toBeVisible();
  await expect(app(page)).toBeVisible({ timeout: 45_000 });
  await expect(editor(page).locator(".canvas-loading")).toBeHidden();
  await expect(editor(page).locator(".render-loading")).toBeHidden();
  await expect(editor(page).locator(".design-paper")).toBeVisible();
}

async function fullViewport(page) {
  const bounds = await editor(page).boundingBox();
  const size = page.viewportSize();
  expect(Math.abs(bounds.x), "overlay starts at viewport left").toBeLessThan(1);
  expect(Math.abs(bounds.y), "overlay starts at viewport top").toBeLessThan(1);
  expect(
    Math.abs(bounds.width - size.width),
    "overlay spans viewport width",
  ).toBeLessThan(1);
  expect(
    Math.abs(bounds.height - size.height),
    "overlay spans viewport height",
  ).toBeLessThan(1);
  expect(
    await page.evaluate(() => document.querySelectorAll("dialog[open]").length),
  ).toBe(1);
}

async function closed(page, trigger) {
  await expect(editor(page)).toHaveCount(0);
  await expect(page.locator(".online-app")).toHaveCount(0);
  if (trigger) await expect(trigger).toBeFocused();
}

async function readDraft(page, suffix) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(`alacam:test:launcher:${key}`);
    return raw && JSON.parse(raw);
  }, suffix);
}

try {
  const desktop = await storefront();
  const { page } = desktop;
  const initialRequests = [];
  page.on("request", (request) => initialRequests.push(request.url()));
  await page.goto(fixtureUrl);
  await expect
    .poll(() => page.evaluate(() => typeof window.AlacamEditor?.open))
    .toBe("function");
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator(".alacam-app")).toHaveCount(0);
  expect(
    initialRequests.filter((url) =>
      /\/src\/(?:main|OnlineDesigner|Editor|Preview)\.(?:tsx?|js)/.test(url),
    ),
  ).toEqual([]);
  expect(
    initialRequests.filter((url) =>
      /three|fabric|pathtracer|layout-.*\.webp/.test(url),
    ),
  ).toEqual([]);
  summary.passed.push(
    "Storefront loads a small launcher without editor, canvas, model or 3D dependencies",
  );

  await page.evaluate(() => window.scrollTo(0, 690));
  const previousScroll = await page.evaluate(() => window.scrollY);
  expect(previousScroll).toBe(690);
  await triggerA(page).click();
  await ready(page);
  await fullViewport(page);
  expect(page.url()).toBe(fixtureUrl);
  await expect(
    editor(page)
      .getByRole("group", { name: "Çalışma görünümü", exact: true })
      .getByRole("button", { name: "2D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    editor(page).getByRole("combobox", { name: "Ürün varyantı", exact: true }),
  ).toHaveValue("10002");
  expect(
    await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const html = getComputedStyle(document.documentElement);
      return (
        body.overflow === "hidden" ||
        body.position === "fixed" ||
        html.overflow === "hidden"
      );
    }),
    "storefront background scrolling is locked",
  ).toBe(true);
  await page.screenshot({ path: `${output}/desktop-open.png` });
  summary.passed.push(
    "Design online opens a full viewport 2D editor without changing URL and uses selected Shopify variant",
  );

  await editor(page)
    .getByRole("button", { name: "Kaydet", exact: true })
    .click();
  await expect(
    editor(page).getByRole("button", { name: "Kaydet", exact: true }),
  ).toBeEnabled();
  await expect(app(page)).toBeVisible();
  await expect(editor(page).locator(".online-save span")).toHaveText(
    "Saves to this device only",
  );
  await expect(
    editor(page).locator(".online-toast[role=status]"),
  ).toContainText("Bu cihazda kaydedildi. Sunucu depolaması bağlı değil.");
  summary.passed.push(
    "Local Save keeps the editor open without pretending to save to an unconfigured server",
  );

  await editor(page).getByRole("button", { name: "Yazı", exact: true }).click();
  await editor(page)
    .getByRole("button", { name: "Yazı ekle", exact: true })
    .click();
  await expect(
    editor(page).getByRole("region", {
      name: "Seçili öğe ayarları",
      exact: true,
    }),
  ).toBeVisible();
  await editor(page)
    .getByRole("textbox", { name: "Tasarım adı", exact: true })
    .fill("Beyaz · Kapatmadan hemen önce");
  const editedAt = Date.now();
  await editor(page)
    .getByRole("button", { name: "Editörü kapat", exact: true })
    .click();
  await closed(page, triggerA(page));
  expect(
    Date.now() - editedAt,
    "close occurs before the 650 ms debounced draft save",
  ).toBeLessThan(650);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(previousScroll);
  expect(
    await page.evaluate(() => getComputedStyle(document.body).overflow),
  ).toBe("auto");
  const alpha = await readDraft(page, "a");
  expect(alpha.name).toBe("Beyaz · Kapatmadan hemen önce");
  expect(alpha.faces.front).toHaveLength(1);
  summary.passed.push(
    "X unmounts editor, flushes a fresh edit before debounce, restores scroll and button focus",
  );

  await page
    .getByRole("combobox", { name: "Mağaza varyantı", exact: true })
    .selectOption("10001");
  await triggerA(page).click();
  await ready(page);
  await expect(
    editor(page).getByRole("textbox", { name: "Tasarım adı", exact: true }),
  ).toHaveValue(alpha.name);
  await expect(
    editor(page).getByRole("combobox", { name: "Ürün varyantı", exact: true }),
  ).toHaveValue("10001");
  await editor(page)
    .getByRole("button", { name: "Render al", exact: true })
    .click();
  const render = page.getByRole("dialog", {
    name: "Stüdyo render",
    exact: true,
  });
  await expect(render).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(render).toHaveCount(0);
  await expect(editor(page)).toBeVisible();
  await expect(app(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await closed(page, triggerA(page));
  summary.passed.push(
    "Reopen restores draft and latest variant; nested Render Escape closes only Render, outer Escape closes editor",
  );

  await triggerB(page).click();
  await ready(page);
  await expect(
    editor(page).getByRole("combobox", { name: "Ürün varyantı", exact: true }),
  ).toHaveValue("20001");
  await expect(
    editor(page).getByRole("textbox", { name: "Tasarım adı", exact: true }),
  ).not.toHaveValue(alpha.name);
  await editor(page)
    .getByRole("textbox", { name: "Tasarım adı", exact: true })
    .fill("Kraft · Bağımsız taslak");
  await page.keyboard.press("Escape");
  await closed(page, triggerB(page));
  expect((await readDraft(page, "b")).name).toBe("Kraft · Bağımsız taslak");
  expect((await readDraft(page, "a")).name).toBe(alpha.name);
  summary.passed.push(
    "Separate product buttons retain isolated drafts and choose their own Shopify variants",
  );

  await triggerA(page).dblclick();
  await ready(page);
  await fullViewport(page);
  await expect(page.locator(".online-app")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await closed(page, triggerA(page));
  summary.passed.push("Rapid double click creates one editor session");

  await page
    .getByRole("button", { name: "Bozuk ayar testi", exact: true })
    .click();
  await expect(editor(page).getByRole("alert")).toBeVisible();
  await expect(page.locator(".online-app")).toHaveCount(0);
  await editor(page)
    .getByRole("button", { name: "Editörü kapat", exact: true })
    .click();
  await closed(
    page,
    page.getByRole("button", { name: "Bozuk ayar testi", exact: true }),
  );
  summary.passed.push(
    "Malformed JSON produces a visible error without mounting a misleading editor",
  );

  const invalidVariant = page.getByRole("button", {
    name: "Geçersiz varyant testi",
    exact: true,
  });
  await invalidVariant.click();
  await expect(editor(page).getByRole("alert")).toBeVisible();
  await expect(editor(page).getByRole("alert")).toContainText(/varyant/i);
  await expect(page.locator(".online-app")).toHaveCount(0);
  await editor(page)
    .getByRole("button", { name: "Editörü kapat", exact: true })
    .click();
  await closed(page, invalidVariant);
  summary.passed.push(
    "A selected form variant outside the configured product is rejected visibly before mounting",
  );

  // Theme editor sections can be replaced without reloading the page. The
  // delegated trigger must discover a newly inserted block and release it on unload.
  await page.evaluate(() => {
    const section = document.createElement("section");
    section.id = "qa-dynamic-section";
    section.innerHTML =
      '<button class="store-button" type="button" data-alacam-open="launcher-config-a">Dinamik Design online</button>';
    document.querySelector("#dynamic-sections").append(section);
    section.dispatchEvent(
      new CustomEvent("shopify:section:load", { bubbles: true }),
    );
  });
  await page
    .getByRole("button", { name: "Dinamik Design online", exact: true })
    .click();
  await ready(page);
  await page.evaluate(() => {
    const section = document.querySelector("#qa-dynamic-section");
    section.dispatchEvent(
      new CustomEvent("shopify:section:unload", { bubbles: true }),
    );
    section.remove();
  });
  await closed(page);
  summary.passed.push(
    "A dynamically loaded Shopify section opens; unloading its section releases the editor",
  );

  await page.evaluate(async () => {
    await window.AlacamEditor.open({
      config: JSON.parse(
        document.querySelector("#launcher-config-b").textContent,
      ),
      trigger: document.querySelector('[data-alacam-open="launcher-config-b"]'),
    });
  });
  await ready(page);
  await expect(
    editor(page).getByRole("textbox", { name: "Tasarım adı", exact: true }),
  ).toHaveValue("Kraft · Bağımsız taslak");
  await page.evaluate(() => window.AlacamEditor.close());
  await closed(page, triggerB(page));
  summary.passed.push(
    "Public AlacamEditor.open/close API opens the configured product and restores its trigger",
  );
  await desktop.context.close();

  const mobile = await storefront({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  await mobile.page.goto(fixtureUrl);
  await expect
    .poll(() => mobile.page.evaluate(() => typeof window.AlacamEditor?.open))
    .toBe("function");
  await triggerA(mobile.page).click();
  await ready(mobile.page);
  await fullViewport(mobile.page);
  expect(mobile.page.url()).toBe(fixtureUrl);
  await expect(
    editor(mobile.page).getByRole("button", {
      name: "Editörü kapat",
      exact: true,
    }),
  ).toBeInViewport();
  await mobile.page.screenshot({ path: `${output}/mobile-open.png` });
  await editor(mobile.page)
    .getByRole("button", { name: "Editörü kapat", exact: true })
    .click();
  await closed(mobile.page, triggerA(mobile.page));
  summary.passed.push(
    "Mobile storefront opens a full viewport editor with reachable close control and restores trigger focus",
  );
  await mobile.context.close();

  const failure = await storefront();
  let rejectImport = true;
  await failure.page.route(/\/src\/main\.tsx(?:\?.*)?$/, (route) =>
    rejectImport ? route.abort("failed") : route.continue(),
  );
  await failure.page.goto(fixtureUrl);
  await expect
    .poll(() => failure.page.evaluate(() => typeof window.AlacamEditor?.open))
    .toBe("function");
  await triggerA(failure.page).click();
  await expect(editor(failure.page).getByRole("alert")).toBeVisible();
  await expect(
    editor(failure.page).getByRole("button", {
      name: "Yeniden dene",
      exact: true,
    }),
  ).toBeVisible();
  await expect(failure.page.locator(".online-app")).toHaveCount(0);
  await failure.page.screenshot({ path: `${output}/load-error.png` });
  rejectImport = false;
  await editor(failure.page)
    .getByRole("button", { name: "Yeniden dene", exact: true })
    .click();
  await ready(failure.page);
  await expect(editor(failure.page).getByRole("alert")).toHaveCount(0);
  await failure.page.keyboard.press("Escape");
  await closed(failure.page, triggerA(failure.page));
  summary.passed.push(
    "Actual editor import network failure exposes retry, which loads the editor after connectivity returns",
  );
  await failure.context.close();

  expect(summary.pageErrors).toEqual([]);
  await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
  console.log("Shopify launcher browser checks passed:", summary);
} catch (error) {
  await latestPage
    ?.screenshot({ path: `${output}/failure.png` })
    .catch(() => {});
  await writeFile(
    `${output}/summary.json`,
    JSON.stringify({ ...summary, error: String(error) }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
