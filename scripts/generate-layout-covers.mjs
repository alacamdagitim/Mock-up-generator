import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { LAYOUTS } from "../shared/layouts.mjs";

// Run against the local Vite server. These original covers are generated once,
// rather than allocating extra WebGL contexts on customers' mobile devices.
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
try {
  const page = await browser.newPage();
  await page.goto(
    `${process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184"}/tests/layout-covers.html`,
  );
  await page.waitForSelector('body[data-ready="true"]', { timeout: 60000 });
  const covers = await page.evaluate(() => window.layoutCoverData);
  await mkdir("src/assets", { recursive: true });
  for (const layout of LAYOUTS) {
    const cover = covers[layout.id];
    if (!cover?.startsWith("data:image/webp;base64,"))
      throw new Error(`Kapak oluşturulamadı: ${layout.id}`);
    await writeFile(
      `src/assets/layout-${layout.id}.webp`,
      Buffer.from(cover.split(",")[1], "base64"),
    );
  }
  console.log(`${LAYOUTS.length} özgün WebP yerleşim kapağı hazır.`);
} finally {
  await browser.close();
}
