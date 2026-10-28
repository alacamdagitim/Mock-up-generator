// Production-only smoke: use `vite preview --port 5185 --strictPort` after build.
// Only the intentionally unconfigured storage health endpoint is substituted.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.ALACAM_BUILD_TEST_URL || "http://127.0.0.1:5185";
const url = `${base}/launcher-demo.html`;
const output = "test-results/shopify-build";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1456, height: 1034 },
});
const page = await context.newPage();
const summary = {
  passed: [],
  pageErrors: [],
  assetErrors: [],
  failedRequests: [],
};
const requests = [];
page.on("request", (request) => requests.push(request.url()));
page.on("pageerror", (error) => summary.pageErrors.push(error.message));
page.on("response", (response) => {
  const pathname = new URL(response.url()).pathname;
  if (response.status() >= 400 && !pathname.endsWith("/favicon.ico"))
    summary.assetErrors.push({
      url: response.url(),
      status: response.status(),
    });
});
page.on("requestfailed", (request) => {
  const failure = request.failure()?.errorText;
  if (failure !== "net::ERR_ABORTED")
    summary.failedRequests.push({ url: request.url(), failure });
});
await page.route("**/demo-no-storage/api/health", (route) =>
  route.fulfill({ json: { storageConfigured: false } }),
);
await mkdir(output, { recursive: true });

const trigger = page.getByRole("button", {
  name: "Online design",
  exact: true,
});
const dialog = page.getByRole("dialog", {
  name: "Alaçam Tasarım Editörü",
  exact: true,
});
async function ready() {
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".online-app")).toBeVisible({ timeout: 45_000 });
  await expect(dialog.locator(".canvas-loading")).toBeHidden();
  await expect(dialog.locator(".render-loading")).toBeHidden();
  await expect(dialog.locator(".design-paper")).toBeVisible();
}
async function closed() {
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".online-app")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(page.url()).toBe(url);
}

try {
  await page.goto(url);
  await expect
    .poll(() => page.evaluate(() => typeof window.AlacamEditor?.open))
    .toBe("function");
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(
    requests.filter((request) =>
      /\/alacam-(?:main[-.]|editor[.-])|\.woff2(?:\?|$)|\.gl(?:b|tf)(?:\?|$)/.test(
        request,
      ),
    ),
    "compiled storefront must not preload the editor, fonts or models",
  ).toEqual([]);
  expect(requests.some((request) => /\/src\//.test(request))).toBe(false);
  summary.passed.push(
    "Built storefront loads launcher without source modules, editor, fonts or models",
  );

  await page
    .getByRole("combobox", { name: "Ürün seçeneği", exact: true })
    .selectOption("10002");
  const versionedEntry = await page.evaluate(() => {
    const script = Array.from(document.scripts).find((element) =>
      new URL(element.src || location.href).pathname.endsWith(
        "/alacam-launcher.js",
      ),
    );
    if (!script) throw new Error("Compiled launcher script is missing");
    const entry = new URL("./alacam-editor.js?v=compiled-smoke", location.href)
      .href;
    script.dataset.alacamEditorSrc = entry;
    return entry;
  });
  const entryRequest = page.waitForRequest(
    (request) => request.url() === versionedEntry,
  );
  await trigger.click();
  await entryRequest;
  await ready();
  expect(page.url()).toBe(url);
  const bounds = await dialog.boundingBox();
  expect(bounds).toEqual({ x: 0, y: 0, width: 1456, height: 1034 });
  await expect(
    dialog.getByRole("combobox", { name: "Ürün varyantı", exact: true }),
  ).toHaveValue("10002");
  await expect(
    dialog
      .getByRole("group", { name: "Çalışma görünümü", exact: true })
      .getByRole("button", { name: "2D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    requests.some((request) => /\/alacam-editor\.js(?:\?|$)/.test(request)),
  ).toBe(true);
  expect(
    requests.filter((request) =>
      new URL(request).pathname.endsWith("/alacam-editor.js"),
    ),
    "launcher imports the exact Shopify versioned editor entry",
  ).toEqual([versionedEntry]);
  expect(
    requests.some((request) => /\/alacam-main-[^/]+\.js(?:\?|$)/.test(request)),
  ).toBe(true);
  expect(requests.some((request) => /\/src\//.test(request))).toBe(false);
  expect(
    await page.evaluate(
      async (entry) => typeof (await import(entry)).mountEditor,
      versionedEntry,
    ),
  ).toBe("function");
  summary.passed.push(
    "Exact Shopify versioned lazy entry and compiled shared chunks mount a full viewport editor with selected variant",
  );
  await page.screenshot({ path: `${output}/compiled-open.png` });

  await dialog.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Kaydet", exact: true }),
  ).toBeEnabled();
  await expect(dialog.locator(".online-toast[role=status]")).toContainText(
    "Bu cihazda kaydedildi. Sunucu depolaması bağlı değil.",
  );
  await expect(dialog.locator(".online-app")).toBeVisible();
  await dialog
    .getByRole("button", { name: "Editörü kapat", exact: true })
    .click();
  await closed();
  summary.passed.push(
    "Built Save keeps the editor open; X unmounts it and restores product button focus",
  );

  await trigger.click();
  await ready();
  await page.keyboard.press("Escape");
  await closed();
  summary.passed.push(
    "Built editor reopens from cached modules and closes with Escape",
  );

  expect(summary.pageErrors).toEqual([]);
  expect(summary.assetErrors).toEqual([]);
  expect(summary.failedRequests).toEqual([]);
  await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
  console.log("Shopify production build smoke passed:", summary);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(
    `${output}/summary.json`,
    JSON.stringify({ ...summary, error: String(error) }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
