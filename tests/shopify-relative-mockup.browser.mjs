// Reproduces the actual Shopify Liquid image.src = "files/base.png" failure.
// Uses an isolated storefront fixture; never changes merchant data.
import { chromium, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const base = process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184";
const directory = "test-results/shopify-relative-mockup";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const errors = [],
  passed = [],
  assets = [];
const prepared = JSON.parse(
  await readFile("shopify/metafields/waffle-hand-cup-r1.json", "utf8"),
);
try {
  for (const ready of [false, true]) {
    const context = await browser.newContext({
      viewport: { width: 1456, height: 1034 },
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/health", (route) =>
      route.fulfill({ json: { storageConfigured: false } }),
    );
    await page.route("**/cdn/shop/files/base.png*", async (route) => {
      assets.push(new URL(route.request().url()).pathname);
      await route.fulfill({
        body: await readFile(
          "public/product-assets/mockup-scenes/hand-cup-r1/base.png",
        ),
        contentType: "image/png",
      });
    });
    await page.route(
      "https://mock-up-generator-y265.vercel.app/product-assets/mockup-scenes/hand-cup-r1/*",
      async (route) => {
        const name = new URL(route.request().url()).pathname.split("/").pop();
        await route.fulfill({
          body: await readFile(
            `public/product-assets/mockup-scenes/hand-cup-r1/${name}`,
          ),
          contentType: name.endsWith(".bin")
            ? "application/octet-stream"
            : "image/png",
        });
      },
    );
    await page.goto(`${base}/tests/fixtures/shopify-launcher.html`);
    await expect
      .poll(() => page.evaluate(() => typeof window.AlacamEditor?.open))
      .toBe("function");
    await page.evaluate(
      ({ ready, prepared }) => {
        const script = document.getElementById("launcher-config-a");
        const config = JSON.parse(script.textContent);
        delete config.productModelUrl;
        delete config.productDielineUrl;
        config.productMockupImages = [
          {
            id: "46582867427634",
            title: "Mockup 1",
            imageUrl: "files/base.png",
            thumbnailUrl: "files/base.png?v=1793311234&width=480",
          },
        ];
        config.productMockupScenes = ready ? prepared : null;
        script.textContent = JSON.stringify(config);
      },
      { ready, prepared },
    );
    await page
      .getByRole("button", { name: "Design online · Beyaz", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "Alaçam Tasarım Editörü",
      exact: true,
    });
    await expect(editor.locator(".online-app")).toBeVisible({ timeout: 45000 });
    await expect(
      editor.getByText("Editör açılamadı", { exact: true }),
    ).toHaveCount(0);
    const card = editor.locator(".mockup-scene-card");
    await expect(card).toHaveCount(1);
    await expect(card.locator("img")).toHaveAttribute(
      "src",
      "/cdn/shop/files/base.png?v=1793311234&width=480",
    );
    if (ready) {
      await expect(card).toBeEnabled();
      await expect(editor.locator(".mockup-preview")).toHaveAttribute(
        "aria-busy",
        "false",
        { timeout: 45000 },
      );
      await expect(editor.locator(".mockup-error")).toHaveCount(0);
      await expect(editor.locator(".mockup-preview-canvas canvas")).toHaveCount(
        1,
      );
      await expect(
        editor.getByRole("button", { name: "Görsel indir", exact: true }),
      ).toBeEnabled();
      passed.push(
        "uploaded Shopify file binds by stable ID to the actual prepared hand-cup scene",
      );
    } else {
      await expect(card).toBeDisabled();
      await expect(
        editor.getByText("Mockup baskı eşlemesi bekleniyor", { exact: true }),
      ).toBeVisible();
      await expect(
        editor.getByRole("button", { name: "Görsel indir", exact: true }),
      ).toBeDisabled();
      passed.push(
        "actual relative file configuration opens the editor with an honest pending mapping state",
      );
    }
    await page.screenshot({
      path: `${directory}/${ready ? "ready" : "pending"}.png`,
    });
    await context.close();
  }
  expect(assets.length).toBeGreaterThanOrEqual(2);
  expect(assets.every((path) => path === "/cdn/shop/files/base.png")).toBe(
    true,
  );
  expect(errors).toEqual([]);
  await writeFile(
    `${directory}/summary.json`,
    JSON.stringify({ passed, errors, assets }, null, 2),
  );
  console.log(JSON.stringify({ passed, errors, assets }, null, 2));
} finally {
  await browser.close();
}
