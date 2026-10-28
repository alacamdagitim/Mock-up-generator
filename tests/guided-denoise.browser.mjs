// Real WebGL shader regression; synthetic input is deliberately not a render.
import { chromium, expect } from "@playwright/test";

const base = process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/qa/guided-denoise", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Guided denoise shader regression</title>",
    }),
  );
  await page.goto(`${base}/qa/guided-denoise`);
  const results = await page.evaluate(async () => {
    const { runGuidedDenoiseFixture } =
      await import("/tests/fixtures/guided-denoise.js");
    return runGuidedDenoiseFixture();
  });
  expect(errors).toEqual([]);
  expect(results.map((result) => result.quality)).toEqual(["standard", "fine"]);
  for (const result of results) {
    expect(result.before.deviation).toBeGreaterThan(15);
    expect(result.after.deviation / result.before.deviation).toBeLessThan(0.23);
    expect(result.strokeRatio).toBeGreaterThan(0.96);
    expect(result.strokeRatio).toBeLessThan(1.04);
    expect(result.maximumAlphaError).toBeLessThanOrEqual(0.5);
    expect(result.materialRestored).toBe(true);
    expect(result.backgroundRestored).toBe(true);
  }
  console.log(JSON.stringify({ passed: "guided-denoise-webgl", results }));
  await context.close();
} finally {
  await browser.close();
}
