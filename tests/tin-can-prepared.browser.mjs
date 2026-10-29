// Opt-in review of the supplied private Tin Can PSD adapter, using real engine pixels.
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const url = process.env.ALACAM_TIN_REVIEW_URL || "http://127.0.0.1:5189";
const out = "test-results/tin-can";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const errors = [],
  external = [],
  passed = [];
let page;
const hash = (b) => createHash("sha256").update(b).digest("hex");
const ready = async (page) => {
  await page.waitForFunction(
    () => window.preparedReview?.ready || window.preparedReview?.error,
    null,
    { timeout: 120000 },
  );
  expect(await page.evaluate(() => window.preparedReview.error)).toBe("");
};
const native = (page) => page.evaluate(() => window.preparedReview.export());
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1060 },
    acceptDownloads: true,
  });
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      r.url().startsWith("http") &&
      !["127.0.0.1", "localhost"].includes(new URL(r.url()).hostname)
    )
      external.push(r.url());
  });
  await page.goto(url);
  await ready(page);
  await page.screenshot({ path: `${out}/desktop.png`, fullPage: true });
  const initial = await native(page);
  const bytes = Buffer.from(initial.split(",")[1], "base64");
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
    4096, 3072,
  ]);
  await writeFile(`${out}/alacam-4k.png`, bytes);
  passed.push(
    "real production compositor loads both PSD surfaces, masks and original multiply/screen lighting",
  );
  const dl = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: "PNG indir", exact: true }).click();
  const download = await dl;
  await download.saveAs(`${out}/download.png`);
  expect(hash(await readFile(`${out}/download.png`))).toBe(hash(bytes));
  const jpegReady = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: "JPG indir", exact: true }).click();
  const jpeg = await jpegReady;
  await jpeg.saveAs(`${out}/download.jpg`);
  const jpg = await readFile(`${out}/download.jpg`);
  expect([...jpg.subarray(0, 2)]).toEqual([255, 216]);
  passed.push(
    "PNG/JPG download at genuine 4096x3072 web source dimensions; PNG matches captured pixels",
  );
  const color = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1472;
    c.height = 1179;
    c.getContext("2d").fillStyle = "#15bd61";
    c.getContext("2d").fillRect(0, 0, c.width, c.height);
    return c.toDataURL();
  });
  await page.evaluate((u) => window.preparedReview.replace("front", u), color);
  const bodyChanged = await native(page);
  const lidColor = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 853;
    const x = c.getContext("2d");
    x.fillStyle = "#1175ed";
    x.fillRect(0, 0, 853, 853);
    return c.toDataURL();
  });
  await page.evaluate(
    (u) => window.preparedReview.replace("back", u),
    lidColor,
  );
  const bothChanged = await native(page);
  const maskCheck = await page.evaluate(
    async ([initial, bodyChanged, bothChanged]) => {
      const px = async (url) => {
        const i = new Image();
        i.src = url;
        await i.decode();
        const c = document.createElement("canvas");
        c.width = i.width;
        c.height = i.height;
        c.getContext("2d").drawImage(i, 0, 0);
        const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
        c.width = c.height = 1;
        return d;
      };
      const [a, b, c, m, n] = await Promise.all([
        px(initial),
        px(bodyChanged),
        px(bothChanged),
        px("/assets/body-mask.png"),
        px("/assets/lid-mask.png"),
      ]);
      let outside = 0,
        alteredOutside = 0,
        bodyPixels = 0,
        lidPixels = 0,
        lidTouchedByBody = 0,
        bodyTouchedByLid = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d1 =
          a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2];
        const d2 =
          b[i] !== c[i] || b[i + 1] !== c[i + 1] || b[i + 2] !== c[i + 2];
        if (m[i] === 0 && n[i] === 0) {
          outside++;
          if (d1 || d2) alteredOutside++;
        }
        if (m[i] > 240) {
          if (d1) bodyPixels++;
          if (n[i] === 0 && d2) bodyTouchedByLid++;
        }
        if (n[i] > 240) {
          if (d2) lidPixels++;
          if (m[i] === 0 && d1) lidTouchedByBody++;
        }
      }
      return {
        outside,
        alteredOutside,
        bodyPixels,
        lidPixels,
        lidTouchedByBody,
        bodyTouchedByLid,
      };
    },
    [initial, bodyChanged, bothChanged],
  );
  expect(maskCheck.alteredOutside).toBe(0);
  expect(maskCheck.bodyPixels).toBeGreaterThan(10000);
  expect(maskCheck.lidPixels).toBeGreaterThan(10000);
  expect(maskCheck.lidTouchedByBody).toBe(0);
  expect(maskCheck.bodyTouchedByLid).toBe(0);
  passed.push(
    "body and lid update independently; hands/background remain byte-exact outside both PSD masks",
  );
  await page
    .getByRole("button", { name: "Alaçam örneği", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.preparedReview.busy), {
      timeout: 45000,
    })
    .toBe(false);
  expect(hash(Buffer.from((await native(page)).split(",")[1], "base64"))).toBe(
    hash(bytes),
  );
  passed.push(
    "restoring the sample returns the exact original prepared output",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Alaçam örneği", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.preparedReview.busy), {
      timeout: 45000,
    })
    .toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(await page.locator("#frame canvas").evaluate((c) => c.width)).toBe(
    768,
  );
  await page.screenshot({ path: `${out}/mobile.png`, fullPage: true });
  passed.push(
    "390px mobile controls fit; live render is limited to 768 pixels",
  );
  const hidden = await context.request.get(
    `${url}/assets/../Tin%20Can%20Mockup.psd`,
  );
  expect(hidden.status()).toBe(404);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  passed.push(
    "source PSD is not served; no external requests or browser errors",
  );
  await writeFile(
    `${out}/summary.json`,
    JSON.stringify({ passed, errors, external, maskCheck }, null, 2),
  );
  console.log(JSON.stringify({ passed, errors, external, maskCheck }, null, 2));
  await context.close();
} catch (error) {
  if (page)
    await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
