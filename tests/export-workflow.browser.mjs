// Public UI regression: local fixtures only; no cloud save, merchant assets or path tracing.
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { blankDesign, parseDesign } from "../shared/schema.mjs";

const base = process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184";
const output = "test-results/export-workflow";
const storageKey = "alacam:qa:export-workflow:v1";
const templateUrl = "https://assets.example.test/alacam-qa-dieline.svg";
const widthMm = 198;
const heightMm = 60;
const template = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}"><g id="cut" fill="none" stroke="#2028b0" stroke-width="0.2"><rect x="1" y="1" width="196" height="58"/></g><script>alert("unsafe-template")</script><image href="https://untrusted.invalid/tracker.png" width="198" height="60"/></svg>`;
const fixture = {
  ...blankDesign(),
  name: "Dışa aktarma kontrolü",
  artboard: {
    canvasWidth: 1200,
    canvasHeight: 364,
    widthMm,
    heightMm,
    sourceUrl: templateUrl,
  },
  faces: {
    front: [
      {
        id: "5877f464-148d-4742-beb1-45f1094f4970",
        kind: "text",
        name: "Başlık",
        text: "ALAÇAM TASARIM",
        x: 300,
        y: 120,
        width: 440,
        height: 100,
        scaleX: 1,
        scaleY: 1,
        angle: 0,
        fill: "#191919",
        fontSize: 42,
        fontFamily: "Arial",
        textAlign: "left",
      },
    ],
    back: [],
  },
};
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: process.env.ALACAM_GPU_METAL === "1" ? ["--use-angle=metal"] : [],
});
const summary = {
  passed: [],
  errors: [],
  gpuErrors: [],
  downloads: {},
  sourcePreview: null,
};
await mkdir(output, { recursive: true });

function pngDimensions(bytes) {
  expect(
    [...bytes.subarray(0, 8)],
    "download must have a real PNG signature",
  ).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.toString("ascii", 12, 16)).toBe("IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function verifyPdf(bytes) {
  const text = bytes.toString("latin1");
  expect(text.startsWith("%PDF-1.4\n")).toBe(true);
  const start = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
  expect(
    start,
    "PDF must end in a valid startxref and EOF marker",
  ).not.toBeNull();
  const xrefOffset = Number(start[1]);
  const xref = text.slice(xrefOffset).split("\n");
  expect(xref[0], "startxref must point to the actual byte offset").toBe(
    "xref",
  );
  const [firstObject, count] = xref[1].trim().split(/\s+/).map(Number);
  expect(firstObject).toBe(0);
  expect(count).toBeGreaterThan(1);
  expect(xref[2]).toMatch(/^0000000000 65535 f/);
  for (let id = 1; id < count; id++) {
    expect(xref[id + 2]).toMatch(/^\d{10} 00000 n/);
    const offset = Number(xref[id + 2].slice(0, 10));
    expect(
      text.slice(offset, offset + `${id} 0 obj`.length),
      `xref offset for PDF object ${id}`,
    ).toBe(`${id} 0 obj`);
  }
  const page = /\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/.exec(text);
  expect(page, "PDF requires an explicit physical page box").not.toBeNull();
  const pageWidth = Number(page[1]),
    pageHeight = Number(page[2]);
  expect(Math.abs(pageWidth - (widthMm * 72) / 25.4)).toBeLessThan(0.0001);
  expect(Math.abs(pageHeight - (heightMm * 72) / 25.4)).toBeLessThan(0.0001);
  expect(text).toContain("/ColorSpace /DeviceRGB");
  expect(text).toContain("/Subtype /Image");
  return {
    bytes: bytes.length,
    pageWidthPt: pageWidth,
    pageHeightPt: pageHeight,
    xrefObjects: count - 1,
  };
}

try {
  const context = await browser.newContext({
    viewport: { width: 1456, height: 1034 },
    deviceScaleFactor: 2,
    acceptDownloads: true,
  });
  await context.addInitScript(
    ({ key, design, url }) => {
      window.AlacamEditorConfig = { storageKey: key, productDielineUrl: url };
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(design));
    },
    { key: storageKey, design: fixture, url: templateUrl },
  );
  const page = await context.newPage();
  const unsafeRequests = [],
    serverWrites = [],
    engineRequests = [];
  page.on("pageerror", (error) => summary.errors.push(error.message));
  page.on("console", (message) => {
    if (/GL_INVALID|THREE.WebGLProgram: Shader Error/.test(message.text()))
      summary.gpuErrors.push(message.text());
  });
  page.on("request", (request) => {
    if (/studioRender|three-gpu-pathtracer/.test(request.url()))
      engineRequests.push(request.url());
    if (request.url().includes("untrusted.invalid"))
      unsafeRequests.push(request.url());
    if (request.method() === "POST" && /\/api\//.test(request.url()))
      serverWrites.push(request.url());
  });
  page.on("dialog", async (dialog) => {
    summary.errors.push(`Unexpected browser dialog: ${dialog.message()}`);
    await dialog.dismiss();
  });
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { storageConfigured: false } }),
  );
  await page.route(templateUrl, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      headers: { "access-control-allow-origin": "*" },
      body: template,
    }),
  );
  const draft = () =>
    page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || "null"),
      storageKey,
    );
  const trigger = page.getByRole("button", {
    name: "Yüzey rengi",
    exact: true,
  });
  const hex = page.getByRole("textbox", { name: "HEX renk kodu", exact: true });
  const face = page.getByRole("combobox", { name: "Baskı yüzü", exact: true });
  const square = page.getByRole("slider", {
    name: "Doygunluk ve parlaklık",
    exact: true,
  });
  const undo = page
    .getByRole("toolbar", { name: "Tuval araçları" })
    .getByRole("button", { name: "Geri al", exact: true });
  const renderButton = page.getByRole("button", {
    name: "Görsel indir",
    exact: true,
  });
  const dialog = page.getByRole("dialog", {
    name: "Stüdyo render",
    exact: true,
  });
  const tab = (name) => dialog.getByRole("tab", { name, exact: true });
  const readyImage = async (image) => {
    await expect(image).toBeVisible({ timeout: 30000 });
    await expect
      .poll(
        () => image.evaluate((node) => node.complete && node.naturalWidth > 0),
        { timeout: 30000 },
      )
      .toBe(true);
  };
  const saveDownload = async (button, filename) => {
    const started = page.waitForEvent("download");
    await button.click();
    const download = await started;
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename().split(".").pop()).toBe(
      filename.split(".").pop(),
    );
    const destination = `${output}/${filename}`;
    await download.saveAs(destination);
    return readFile(destination);
  };
  const fitsViewport = async (locator) => {
    const box = await locator.boundingBox(),
      viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  };

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".preview-render canvas")).toBeVisible({
    timeout: 45000,
  });
  await expect(page.locator(".product-template-overlay")).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator(".canvas-loading")).toBeHidden();
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(hex).toBeFocused();
  await hex.fill("#22aa66");
  await hex.press("Enter");
  await expect
    .poll(async () => (await draft())?.surfaceColors?.front)
    .toBe("#22aa66");
  expect((await draft()).background).toBe("#ffffff");
  expect((await draft()).surfaceColors.back).toBeUndefined();
  await page.screenshot({
    animations: "disabled",
    path: `${output}/surface-desktop.png`,
  });
  await hex.press("Escape");
  await expect(page.locator(".surface-color-popover")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await face.selectOption("back");
  await trigger.click();
  await expect(hex).toHaveValue("#ffffff");
  await hex.fill("#2244aa");
  await hex.press("Enter");
  await hex.press("Escape");
  await expect
    .poll(async () => (await draft())?.surfaceColors?.back)
    .toBe("#2244aa");
  await face.selectOption("front");
  await trigger.click();
  await expect(hex).toHaveValue("#22aa66");
  const squareBox = await square.boundingBox();
  await page.mouse.move(
    squareBox.x + squareBox.width * 0.2,
    squareBox.y + squareBox.height * 0.2,
  );
  await page.mouse.down();
  await page.mouse.move(
    squareBox.x + squareBox.width * 0.8,
    squareBox.y + squareBox.height * 0.6,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await draft())?.surfaceColors?.front)
    .not.toBe("#22aa66");
  await square.press("Escape");
  await undo.click();
  await expect
    .poll(async () => (await draft())?.surfaceColors?.front)
    .toBe("#22aa66");
  expect((await draft()).surfaceColors.back).toBe("#2244aa");
  summary.passed.push(
    "Front/back surface colors stay independent; continuous HSV drag takes one Undo; Escape restores focus",
  );

  await page.reload();
  await expect(trigger).toBeVisible({ timeout: 30000 });
  await trigger.click();
  await expect(hex).toHaveValue("#22aa66");
  await hex.fill("#gggggg");
  await hex.press("Enter");
  await expect(hex).toHaveAttribute("aria-invalid", "true");
  await hex.fill("#22aa66");
  await hex.press("Enter");
  await expect(hex).toHaveAttribute("aria-invalid", "false");
  await square.focus();
  await square.press("ArrowRight");
  await expect(hex).not.toHaveValue("#22aa66");
  await square.press("Escape");
  await undo.click();
  await expect
    .poll(async () => (await draft())?.surfaceColors?.front)
    .toBe("#22aa66");
  summary.passed.push(
    "Reload restores v1 per-face colors; invalid HEX is rejected; HSV works with keyboard arrows",
  );

  await renderButton.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab")).toHaveCount(3);
  await expect(tab("Görsel")).toHaveAttribute("aria-selected", "true");
  const sourceImage = dialog.locator(".studio-render-source-image");
  await readyImage(sourceImage);
  const source = await sourceImage.evaluate((image) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }));
  expect(
    source.width,
    "render dialog must capture a sharp source rather than stretch its small preview",
  ).toBeGreaterThanOrEqual(1024);
  summary.sourcePreview = source;
  await expect(
    dialog.getByRole("button", { name: "Canlı görünüm", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    dialog.getByRole("button", { name: "2048 px", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("combobox", { name: "Render görsel oranı" }),
  ).toHaveCount(0);
  const capturedPngHash = await sourceImage.evaluate(async (image) => {
    const bytes = await (await fetch(image.src)).arrayBuffer();
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return [...digest]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  });
  const livePng = await saveDownload(
    dialog.getByRole("button", { name: "Görseli indir", exact: true }),
    "live.png",
  );
  expect(pngDimensions(livePng)).toEqual(source);
  expect(
    createHash("sha256").update(livePng).digest("hex"),
    "fast PNG must preserve the actual captured bytes without resizing",
  ).toBe(capturedPngHash);
  await dialog
    .getByRole("group", { name: "Canlı görsel biçimi" })
    .getByRole("button", { name: "JPG", exact: true })
    .click();
  const liveJpg = await saveDownload(
    dialog.getByRole("button", { name: "Görseli indir", exact: true }),
    "live.jpg",
  );
  expect(liveJpg.subarray(0, 2).toString("hex")).toBe("ffd8");
  const jpegSize = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/jpeg;base64,${data}`;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, liveJpg.toString("base64"));
  expect(jpegSize).toEqual(source);
  await dialog
    .getByRole("group", { name: "Canlı görsel biçimi" })
    .getByRole("button", { name: "PNG", exact: true })
    .click();
  expect(
    engineRequests,
    "fast downloads must not import the offline render engine",
  ).toEqual([]);
  await page.screenshot({
    animations: "disabled",
    path: `${output}/live-desktop.png`,
  });
  summary.downloads.live = {
    ...source,
    pngBytes: livePng.length,
    jpgBytes: liveJpg.length,
  };
  summary.passed.push(
    "Default live download preserves captured PNG bytes and native PNG/JPG dimensions without importing the path-tracing engine",
  );
  await tab("Görsel").focus();
  await tab("Görsel").press("ArrowRight");
  await expect(tab("Bıçak izi")).toBeFocused();
  await expect(tab("Bıçak izi")).toHaveAttribute("aria-selected", "true");
  const artworkImage = dialog.locator(
    ".export-panel-dieline-stage .export-panel-artwork",
  );
  await readyImage(artworkImage);
  await expect(dialog.getByText("198 × 60 mm", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "CMYK", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    animations: "disabled",
    path: `${output}/dieline-desktop.png`,
  });
  summary.passed.push(
    "Görsel indir opens three keyboard-accessible tabs with a sharp current 3D preview and physical dieline dimensions",
  );

  const svgBytes = await saveDownload(
    dialog.getByRole("button", { name: "SVG olarak indir", exact: true }),
    "artwork.svg",
  );
  const svgText = svgBytes.toString("utf8");
  const svg = await page.evaluate((text) => {
    const document = new DOMParser().parseFromString(text, "image/svg+xml");
    return {
      parserError: Boolean(document.querySelector("parsererror")),
      width: document.documentElement.getAttribute("width"),
      height: document.documentElement.getAttribute("height"),
      artworkImage: document
        .querySelector("#artwork image")
        ?.getAttribute("href"),
      cutLines: document.querySelectorAll("#dieline rect").length,
      unsafeNodes: document.querySelectorAll("script, foreignObject").length,
    };
  }, svgText);
  expect(svg.parserError).toBe(false);
  expect(svg.width).toBe("198mm");
  expect(svg.height).toBe("60mm");
  expect(svg.cutLines).toBeGreaterThan(0);
  expect(svg.unsafeNodes).toBe(0);
  expect(svgText).not.toContain("untrusted.invalid");
  expect(svgText).not.toContain("unsafe-template");
  expect(svg.artworkImage).toMatch(/^data:image\/png;base64,/);
  const embedded = pngDimensions(
    Buffer.from(svg.artworkImage.split(",")[1], "base64"),
  );
  expect(embedded.width).toBe(2048);
  summary.downloads.svg = {
    bytes: svgBytes.length,
    widthMm,
    heightMm,
    embedded,
  };
  await dialog.getByRole("button", { name: /^Yalnız bıçak izi/ }).click();
  const cutOnly = (
    await saveDownload(
      dialog.getByRole("button", { name: "SVG olarak indir", exact: true }),
      "dieline-only.svg",
    )
  ).toString("utf8");
  expect(cutOnly).toContain('id="dieline"');
  expect(cutOnly).not.toContain("<image");
  await dialog.getByRole("button", { name: /^Tasarımlı şablon/ }).click();
  summary.passed.push(
    "SVG export contains real physical dimensions, separate cut lines and 2K artwork; dieline-only excludes artwork; unsafe source content stays removed",
  );

  await dialog.getByRole("button", { name: "PNG", exact: true }).click();
  const png = await saveDownload(
    dialog.getByRole("button", { name: "PNG olarak indir", exact: true }),
    "artwork.png",
  );
  const pngSize = pngDimensions(png);
  expect(pngSize.width).toBe(2048);
  expect(pngSize.height).toBe(
    Math.round(
      (2048 * fixture.artboard.canvasHeight) / fixture.artboard.canvasWidth,
    ),
  );
  const pixel = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return [...context.getImageData(20, 20, 1, 1).data];
  }, png.toString("base64"));
  expect(
    pixel,
    "PNG must export the active face color rather than the legacy global or back color",
  ).toEqual([34, 170, 102, 255]);
  summary.downloads.png = { bytes: png.length, ...pngSize, samplePixel: pixel };
  await dialog.getByRole("button", { name: "PDF", exact: true }).click();
  const pdf = await saveDownload(
    dialog.getByRole("button", { name: "PDF olarak indir", exact: true }),
    "artwork.pdf",
  );
  summary.downloads.pdf = verifyPdf(pdf);
  const jsonBytes = await saveDownload(
    dialog.getByRole("button", {
      name: "Düzenlenebilir JSON’u indir",
      exact: true,
    }),
    "editable.json",
  );
  const exportedDesign = parseDesign(JSON.parse(jsonBytes.toString("utf8")));
  expect(exportedDesign.surfaceColors).toEqual({
    front: "#22aa66",
    back: "#2244aa",
  });
  expect(exportedDesign.artboard.widthMm).toBe(widthMm);
  expect(exportedDesign.artboard.heightMm).toBe(heightMm);
  summary.passed.push(
    "Downloaded PNG has 2048 real pixels and correct face color; PDF byte offsets/xref and 198 × 60 mm page box validate; JSON stays editable v1",
  );

  await tab("Paylaş").click();
  await expect(
    dialog.getByText("Sunucu depolaması bağlı değil", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", {
      name: "Kaydet ve bağlantı oluştur",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("textbox", { name: "Dosya bağlantısı", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Bağlantıyı kopyala", exact: true }),
  ).toHaveCount(0);
  const shareImage = dialog.locator(".export-panel-share-preview");
  await readyImage(shareImage);
  expect(await shareImage.getAttribute("src")).toBe(
    await sourceImage.getAttribute("src"),
  );
  await page.screenshot({
    animations: "disabled",
    path: `${output}/share-desktop.png`,
  });
  await dialog
    .getByRole("group", { name: "Paylaşım önizleme görünümü" })
    .getByRole("button", { name: "2B", exact: true })
    .click();
  await readyImage(
    dialog.locator(".export-panel-share-stage .export-panel-artwork"),
  );
  expect(serverWrites).toEqual([]);
  summary.passed.push(
    "Share offers actual current 3B/2B previews and no fake URL, enabled save or server write when storage is unconfigured",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await fitsViewport(dialog);
  await fitsViewport(
    dialog.getByRole("button", {
      name: "Render penceresini kapat",
      exact: true,
    }),
  );
  await fitsViewport(
    dialog.getByRole("button", {
      name: "Düzenlenebilir JSON’u indir",
      exact: true,
    }),
  );
  await page.screenshot({
    animations: "disabled",
    path: `${output}/share-mobile.png`,
  });
  await tab("Görsel").click();
  await fitsViewport(
    dialog.getByRole("button", { name: "Görseli indir", exact: true }),
  );
  const liveControls = await dialog
    .locator(".studio-render-live-content")
    .boundingBox();
  const liveFormats = await dialog
    .getByRole("group", { name: "Canlı görsel biçimi" })
    .boundingBox();
  expect(liveFormats.y).toBeGreaterThanOrEqual(liveControls.y);
  expect(liveFormats.y + liveFormats.height).toBeLessThanOrEqual(
    liveControls.y + liveControls.height + 1,
  );
  await page.screenshot({
    animations: "disabled",
    path: `${output}/live-mobile.png`,
  });
  expect(engineRequests).toEqual([]);
  await dialog
    .getByRole("button", { name: "Stüdyo render", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "1024 px", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    dialog.getByRole("button", { name: "8192 px", exact: true }),
  ).toBeDisabled();
  await tab("Bıçak izi").click();
  await expect(
    dialog.getByRole("button", { name: "4K", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    animations: "disabled",
    path: `${output}/dieline-mobile.png`,
  });
  await dialog
    .getByRole("button", { name: "Render penceresini kapat", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(renderButton).toBeFocused();
  await page
    .getByRole("group", { name: "Çalışma görünümü", exact: true })
    .getByRole("button", { name: "2D", exact: true })
    .click();
  const closePanel = page.getByRole("button", {
    name: "Düzenleme panelini kapat",
    exact: true,
  });
  if (await closePanel.isVisible()) await closePanel.click();
  await trigger.click();
  await expect(hex).toBeVisible();
  await fitsViewport(page.locator(".surface-color-popover"));
  const transform = await page.locator(".design-paper").getAttribute("style");
  const mobileSquare = await square.boundingBox();
  await page.mouse.click(
    mobileSquare.x + mobileSquare.width * 0.65,
    mobileSquare.y + mobileSquare.height * 0.45,
  );
  expect(await page.locator(".design-paper").getAttribute("style")).toBe(
    transform,
  );
  await page.screenshot({
    animations: "disabled",
    path: `${output}/surface-mobile.png`,
  });
  await page
    .getByRole("button", { name: "Renk seçiciyi kapat", exact: true })
    .click();
  await expect(trigger).toBeFocused();
  summary.passed.push(
    "390px dialog, close and download controls fit; mobile resolution caps apply; surface popover fits without hijacking canvas pan",
  );
  expect(unsafeRequests).toEqual([]);
  expect(summary.errors).toEqual([]);
  expect(summary.gpuErrors).toEqual([]);
} finally {
  await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
  await browser.close();
  console.log(JSON.stringify(summary, null, 2));
}
