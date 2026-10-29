import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184";
const out = new URL("../test-results/mockup-engine/", import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(base);
  const assets = await page.evaluate(() => {
    function png(draw) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      draw(canvas.getContext("2d"));
      return canvas.toDataURL("image/png").split(",")[1];
    }
    return {
      base: png((ctx) => {
        ctx.fillStyle = "#b4b4b4";
        ctx.fillRect(0, 0, 64, 64);
      }),
      mask: png((ctx) => {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = "white";
        ctx.fillRect(8, 8, 24, 48);
      }),
      uv8: png((ctx) => {
        const image = ctx.createImageData(64, 64);
        for (let y = 0; y < 64; y++)
          for (let x = 0; x < 64; x++) {
            const i = (y * 64 + x) * 4;
            image.data[i] = x < 32 ? 64 : 191;
            image.data[i + 1] = 128;
            image.data[i + 3] = y >= 8 && y < 56 ? 255 : 0;
          }
        ctx.putImageData(image, 0, 0);
      }),
      fullmask: png((ctx) => {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 64, 64);
      }),
      shade: png((ctx) => {
        ctx.fillStyle = "#808080";
        ctx.fillRect(0, 0, 64, 64);
      }),
      light: png((ctx) => {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(12, 12, 5, 5);
      }),
    };
  });
  const binary = Buffer.alloc(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const o = (y * 64 + x) * 4;
      binary.writeUInt16LE(x < 32 ? 16384 : 49151, o);
      binary.writeUInt16LE(32768, o + 2);
    }
  await page.route("**/__mockup-test__/**", (route) => {
    const key = new URL(route.request().url()).pathname.split("/").pop();
    if (key === "uv.bin")
      return route.fulfill({
        body: binary,
        contentType: "application/octet-stream",
      });
    if (key === "short.bin")
      return route.fulfill({
        body: binary.subarray(0, 10),
        contentType: "application/octet-stream",
      });
    if (key === "oversized.png") {
      const body = Buffer.from(assets.base, "base64");
      body.writeUInt32BE(20000, 16);
      return route.fulfill({ body, contentType: "image/png" });
    }
    if (key === "unsafe.png")
      return route.fulfill({
        body: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        contentType: "image/png",
      });
    const body = assets[key.replace(".png", "")];
    return body
      ? route.fulfill({
          body: Buffer.from(body, "base64"),
          contentType: "image/png",
        })
      : route.abort();
  });
  const result = await page.evaluate(async () => {
    const { loadMockupScene, composeMockup, canvasDataUrl } =
      await import("/src/mockups/compositor.ts");
    const { DEMO_MOCKUP_SCENES } = await import("/src/mockups/demo.ts");
    const checks = [];
    const check = (name, value) => {
      if (!value) throw Error(name);
      checks.push(name);
    };
    function source() {
      const c = document.createElement("canvas");
      c.width = c.height = 32;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(0, 0, 16, 32);
      ctx.fillStyle = "#00ff00";
      ctx.fillRect(16, 0, 16, 32);
      return c;
    }
    const front = source(),
      back = document.createElement("canvas");
    back.width = back.height = 32;
    back.getContext("2d").fillStyle = "#0000ff";
    back.getContext("2d").fillRect(0, 0, 32, 32);
    const textures = { front, back };
    const scene = (surfaces, extra = {}) => ({
      id: "test-scene",
      title: "Fixture",
      width: 64,
      height: 64,
      distribution: "public-web",
      baseImageUrl: "/__mockup-test__/base.png",
      surfaces,
      ...extra,
    });
    const quad = {
      id: "label",
      face: "front",
      blend: "source-over",
      mapping: {
        type: "quad",
        points: [
          [8, 8],
          [56, 8],
          [56, 56],
          [8, 56],
        ],
      },
    };
    const pixel = (c, x, y) =>
      Array.from(c.getContext("2d").getImageData(x, y, 1, 1).data);
    async function compose(s, opts = {}) {
      const controller = new AbortController();
      const loaded = await loadMockupScene(s, controller.signal);
      try {
        return await composeMockup(loaded, textures, opts);
      } finally {
        loaded.dispose();
      }
    }
    let canvas = await compose(scene([quad]));
    check(
      "quad-projective-pixels",
      pixel(canvas, 15, 32)[0] === 255 &&
        pixel(canvas, 48, 32)[1] === 255 &&
        pixel(canvas, 2, 2)[0] === 180,
    );
    canvas = await compose(
      scene([
        {
          ...quad,
          mapping: {
            type: "quad",
            points: [
              [8, 8],
              [56, 16],
              [48, 56],
              [16, 48],
            ],
          },
        },
      ]),
    );
    check(
      "perspective-quad-transform",
      pixel(canvas, 18, 28)[0] === 255 &&
        pixel(canvas, 45, 30)[1] === 255 &&
        pixel(canvas, 5, 5)[0] === 180,
    );
    canvas = await compose(
      scene([{ ...quad, sourceRect: { x: 0.5, y: 0, width: 0.5, height: 1 } }]),
    );
    check(
      "normalized-diecut-source-rectangle",
      pixel(canvas, 15, 32)[1] === 255 && pixel(canvas, 48, 32)[1] === 255,
    );
    canvas = await compose(
      scene([
        {
          ...quad,
          mapping: {
            type: "quad",
            points: [
              [4, 8],
              [28, 8],
              [28, 56],
              [4, 56],
            ],
          },
          sourceRect: { x: 0.5, y: 0, width: 0.5, height: 1 },
        },
        {
          ...quad,
          id: "back",
          face: "back",
          mapping: {
            type: "quad",
            points: [
              [36, 8],
              [60, 8],
              [60, 56],
              [36, 56],
            ],
          },
        },
      ]),
    );
    check(
      "independent-front-and-back",
      pixel(canvas, 15, 32)[1] === 255 && pixel(canvas, 48, 32)[2] === 255,
    );
    canvas = await compose(
      scene([{ ...quad, maskUrl: "/__mockup-test__/mask.png" }]),
    );
    check(
      "mask-protects-unprinted-photo",
      pixel(canvas, 15, 32)[0] === 255 && pixel(canvas, 48, 32)[0] === 180,
    );
    canvas = await compose(
      scene([
        {
          ...quad,
          mapping: { type: "uv-rg16le", url: "/__mockup-test__/uv.bin" },
          maskUrl: "/__mockup-test__/fullmask.png",
        },
      ]),
    );
    check(
      "native-16bit-uv-map",
      pixel(canvas, 15, 32)[0] === 255 && pixel(canvas, 48, 32)[1] === 255,
    );
    canvas = await compose(
      scene([
        {
          ...quad,
          mapping: { type: "uv-rg8", url: "/__mockup-test__/uv8.png" },
        },
      ]),
    );
    check(
      "png-uv-map-alpha-coverage",
      pixel(canvas, 15, 32)[0] === 255 &&
        pixel(canvas, 48, 32)[1] === 255 &&
        pixel(canvas, 15, 2)[0] === 180,
    );
    canvas = await compose(
      scene([{ ...quad, shadingUrl: "/__mockup-test__/shade.png" }], {
        layers: [{ imageUrl: "/__mockup-test__/light.png", blend: "screen" }],
      }),
    );
    check(
      "shading-and-highlight-pass",
      pixel(canvas, 15, 32)[0] === 128 &&
        pixel(canvas, 14, 14)[0] === 255 &&
        pixel(canvas, 2, 2)[0] === 180,
    );
    const requests = [];
    await compose(
      scene(
        Array.from({ length: 8 }, (_, index) => ({
          ...quad,
          id: `copy-${index}`,
          backgroundMode: index < 4 ? "design" : "transparent",
        })),
      ),
      {
        artworkProvider: (face, mode) => {
          requests.push(`${face}:${mode}`);
          return textures[face];
        },
      },
    );
    check(
      "repeated-surfaces-share-face-render",
      requests.length === 2 &&
        requests.includes("front:design") &&
        requests.includes("front:transparent"),
    );
    const transparent = document.createElement("canvas");
    transparent.width = transparent.height = 32;
    transparent.getContext("2d").fillStyle = "#00ff00";
    transparent.getContext("2d").fillRect(0, 0, 16, 32);
    let requested = "";
    canvas = await compose(
      scene([{ ...quad, backgroundMode: "transparent" }]),
      {
        artworkProvider: (_, mode) => {
          requested = mode;
          return transparent;
        },
      },
    );
    check(
      "transparent-artwork-retains-photo",
      requested === "transparent" &&
        pixel(canvas, 15, 32)[1] === 255 &&
        pixel(canvas, 48, 32)[0] === 180,
    );
    let shortRejected = false;
    try {
      await compose(
        scene([
          {
            ...quad,
            mapping: { type: "uv-rg16le", url: "/__mockup-test__/short.bin" },
            maskUrl: "/__mockup-test__/fullmask.png",
          },
        ]),
      );
    } catch {
      shortRejected = true;
    }
    check("truncated-uv-map-rejected", shortRejected);
    let unsafeRejected = false;
    try {
      await compose(
        scene([quad], { baseImageUrl: "/__mockup-test__/unsafe.png" }),
      );
    } catch {
      unsafeRejected = true;
    }
    check("svg-disguised-as-png-rejected", unsafeRejected);
    let oversizedRejected = false;
    try {
      await compose(
        scene([quad], { baseImageUrl: "/__mockup-test__/oversized.png" }),
      );
    } catch (error) {
      oversizedRejected = /piksel/.test(error.message);
    }
    check("oversized-image-rejected-before-decoding", oversizedRejected);
    const aborted = new AbortController();
    aborted.abort();
    let abortName = "";
    try {
      await loadMockupScene(scene([quad]), aborted.signal);
    } catch (error) {
      abortName = error.name;
    }
    check("abort-stops-asset-loading", abortName === "AbortError");
    const demo = await loadMockupScene(
      DEMO_MOCKUP_SCENES[0],
      new AbortController().signal,
    );
    try {
      const preview = await composeMockup(demo, textures, { maxEdge: 512 });
      check(
        "preview-reduces-without-upscaling",
        preview.height === 512 && preview.width === 384,
      );
      const started = performance.now();
      const native = await composeMockup(demo, textures);
      check(
        "native-export-dimensions",
        native.width === 1024 && native.height === 1365,
      );
      const png = await canvasDataUrl(native, "image/png"),
        jpg = await canvasDataUrl(native, "image/jpeg");
      check(
        "native-png-and-jpg-encoding",
        png.startsWith("data:image/png;base64,") &&
          jpg.startsWith("data:image/jpeg;base64,"),
      );
      check(
        "source-artwork-remains-unchanged",
        pixel(front, 2, 2)[0] === 255 && pixel(front, 29, 29)[1] === 255,
      );
      return {
        checks,
        nativeMs: Math.round(performance.now() - started),
        png,
        jpg,
      };
    } finally {
      demo.dispose();
    }
  });
  const { png, jpg, ...summary } = result;
  await writeFile(
    new URL("native-demo.png", out),
    Buffer.from(png.split(",")[1], "base64"),
  );
  await writeFile(
    new URL("native-demo.jpg", out),
    Buffer.from(jpg.split(",")[1], "base64"),
  );
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("summary.json", out),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
}
