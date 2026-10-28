// Actual path-traced high-resolution output with a small original calibration plane.
// This verifies tiling/encoding, not photorealism of an imported product.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184";
const resolution = Number(process.env.ALACAM_HIGH_RESOLUTION || 8192);
const format = process.env.ALACAM_HIGH_FORMAT || "jpeg";
const shadow = process.env.ALACAM_HIGH_SHADOW === "1";
const output = "test-results/high-resolution";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: process.env.ALACAM_GPU_METAL === "1" ? ["--use-angle=metal"] : [],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (/GL_INVALID|Shader Error/.test(m.text())) errors.push(m.text());
  });
  await page.route("**/qa/high-resolution", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><body><h1>Gerçek yüksek çözünürlük testi</h1></body></html>",
    }),
  );
  await page.goto(`${base}/qa/high-resolution`);
  let latest = 0;
  await page.exposeFunction("highResProgress", (p) => {
    if (p.percent > latest + 5) {
      latest = p.percent;
      console.log(
        `${p.percent.toFixed(1)}% · ${Math.round(p.elapsedMs / 1000)}s`,
      );
    }
  });
  const result = await page.evaluate(
    async ({ resolution, format, shadow }) => {
      const T = await import("/node_modules/.vite/deps/three.js");
      const { renderStudio } = await import("/src/render/studioRender.ts");
      const { captureRenderSnapshot } = await import("/src/render/snapshot.ts");
      const { DEFAULT_PRESENTATION } = await import("/shared/schema.mjs");
      const art = document.createElement("canvas");
      art.width = art.height = 256;
      const ink = art.getContext("2d");
      ink.fillStyle = "#ff4b21";
      ink.fillRect(0, 0, 128, 256);
      ink.fillStyle = "#1761ef";
      ink.fillRect(128, 0, 128, 256);
      const map = new T.CanvasTexture(art);
      map.colorSpace = T.SRGBColorSpace;
      const material = new T.MeshStandardMaterial({ map, roughness: 0.75 });
      const root = new T.Group();
      root.add(new T.Mesh(new T.PlaneGeometry(3, 3), material));
      const camera = new T.PerspectiveCamera(34, 1, 0.1, 100);
      camera.position.set(0, 0, 7);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
      const snapshot = captureRenderSnapshot(
        root,
        camera,
        new T.Vector3(),
        DEFAULT_PRESENTATION,
      );
      const canvas = document.createElement("canvas");
      document.body.append(canvas);
      const contexts = [];
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const value = getContext.apply(this, args);
        if (args[0] === "webgl2" && value) contexts.push(value);
        return value;
      };
      let maxGpuEdge = 0,
        last = -1;
      const result = await renderStudio(
        snapshot,
        {
          resolution,
          format,
          quality: "standard",
          studio: "softbox",
          background: shadow
            ? "white"
            : format === "png"
              ? "transparent"
              : "white",
          aspect: "square",
          floorShadow: shadow,
        },
        {
          canvas,
          onProgress: (p) => {
            for (const gl of contexts)
              maxGpuEdge = Math.max(
                maxGpuEdge,
                gl.drawingBufferWidth,
                gl.drawingBufferHeight,
              );
            if (p.percent < last) throw Error("Non-monotonic real progress");
            last = p.percent;
            window.highResProgress(p);
          },
        },
      );
      const image = await createImageBitmap(result.blob);
      const probe = document.createElement("canvas");
      probe.width = probe.height = 256;
      const context = probe.getContext("2d");
      context.drawImage(image, 0, 0, 256, 256);
      const data = context.getImageData(0, 0, 256, 256).data;
      let red = 0,
        blue = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > data[i + 1] * 1.3 && data[i] > data[i + 2] * 1.3) red++;
        if (data[i + 2] > data[i] * 1.3 && data[i + 2] > data[i + 1] * 1.1)
          blue++;
      }
      const url = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(result.blob);
      });
      const report = {
        width: image.width,
        height: image.height,
        mime: result.blob.type,
        bytes: result.blob.size,
        samples: result.samples,
        seconds: result.seconds,
        maxGpuEdge,
        red,
        blue,
        assemblyReleased: canvas.width === 1 && canvas.height === 1,
        contextsReleased: contexts.every((gl) => gl.isContextLost()),
        seams: [],
        url,
      };
      if (shadow && resolution >= 4096) {
        const strip = document.createElement("canvas");
        strip.width = 8;
        strip.height = 512;
        const pixels = strip.getContext("2d");
        for (let x = 1024; x < resolution; x += 1024) {
          pixels.drawImage(image, x - 4, 128, 8, 512, 0, 0, 8, 512);
          const data = pixels.getImageData(0, 0, 8, 512).data;
          let left = 0,
            right = 0;
          for (let y = 0; y < 512; y++)
            for (let px = 0; px < 8; px++) {
              const index = (y * 8 + px) * 4;
              const luma =
                (data[index] + data[index + 1] + data[index + 2]) / 3;
              if (px < 4) left += luma;
              else right += luma;
            }
          report.seams.push({
            x,
            difference: Math.abs(left - right) / (4 * 512),
          });
        }
      }
      image.close();
      root.children[0].geometry.dispose();
      material.dispose();
      map.dispose();
      canvas.remove();
      return report;
    },
    { resolution, format, shadow },
  );
  expect(result.width).toBe(resolution);
  expect(result.height).toBe(resolution);
  expect(result.maxGpuEdge).toBeLessThanOrEqual(
    resolution <= 2048 ? 2048 : 1048,
  );
  expect(result.red).toBeGreaterThan(3000);
  expect(result.blue).toBeGreaterThan(3000);
  expect(result.samples).toBe(64);
  expect(result.contextsReleased).toBe(true);
  expect(result.assemblyReleased).toBe(true);
  expect(result.mime).toBe(format === "png" ? "image/png" : "image/jpeg");
  expect(errors).toEqual([]);
  for (const seam of result.seams) expect(seam.difference).toBeLessThan(0.75);
  await writeFile(
    `${output}/calibration-${resolution}.${format === "png" ? "png" : "jpg"}`,
    Buffer.from(result.url.split(",")[1], "base64"),
  );
  delete result.url;
  await writeFile(
    `${output}/summary-${resolution}-${format}.json`,
    JSON.stringify({ ...result, errors }, null, 2),
  );
  console.log(result);
} finally {
  await browser.close();
}
