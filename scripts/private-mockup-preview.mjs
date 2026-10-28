#!/usr/bin/env node
/**
 * A local-only preview for private Photoshop mockup passes.
 * No HTTP server starts. Playwright answers the isolated page's requests from
 * Node buffers; source files are never copied to public/, dist/ or the repository.
 * Only flattened PNG/JPG output is written to the chosen private output folder.
 */
import { chromium } from "@playwright/test";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const privateOrigin = "http://private-mockup.local";
const maximumArtworkBytes = 32 * 1024 * 1024;

function inside(root, path) {
  const child = relative(root, path);
  return (
    child === "" ||
    (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child))
  );
}

function contentType(path) {
  return (
    {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".json": "application/json; charset=utf-8",
      ".mjs": "text/javascript; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".html": "text/html; charset=utf-8",
    }[extname(path).toLowerCase()] || "application/octet-stream"
  );
}

function assertPrivate(path, label) {
  if (inside(projectRoot, path))
    throw new Error(
      `${label} proje klasörünün dışında olmalı. Örneğin /tmp/alacam-private-mockup kullanın.`,
    );
}

/** Exported so the same local page can be exercised by a browser QA script. */
export async function createPrivateMockupSession({
  assets,
  artwork,
  manifest: manifestPath,
  maxEdge,
  headed = false,
  executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  compositor = resolve(
    projectRoot,
    "scripts/lib/private-mockup-compositor.mjs",
  ),
}) {
  const assetsRoot = await realpath(resolve(assets));
  const artworkPath = await realpath(resolve(artwork));
  const manifestFile = await realpath(
    resolve(manifestPath || resolve(assetsRoot, "manifest.json")),
  );
  assertPrivate(assetsRoot, "Kaynak katmanlar");
  assertPrivate(artworkPath, "Tasarım görseli");
  if (!inside(assetsRoot, manifestFile))
    throw new Error(
      "Manifest kaynak katmanların bulunduğu özel klasörde olmalı.",
    );
  if (!(await stat(assetsRoot)).isDirectory())
    throw new Error("--assets bir klasör olmalı.");
  const artworkStat = await stat(artworkPath);
  if (!artworkStat.isFile() || artworkStat.size > maximumArtworkBytes)
    throw new Error("Tasarım görseli en fazla 32 MB olabilir.");
  if (
    ![".png", ".jpg", ".jpeg", ".webp"].includes(
      extname(artworkPath).toLowerCase(),
    )
  )
    throw new Error("Tasarım görseli PNG, JPG veya WebP olmalı.");
  const manifestStat = await stat(manifestFile);
  if (!manifestStat.isFile() || manifestStat.size > 2 * 1024 * 1024)
    throw new Error("Manifest geçersiz veya 2 MB sınırını aşıyor.");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
    throw new Error("Manifest bir JSON nesnesi olmalı.");
  if (
    maxEdge !== undefined &&
    (!Number.isInteger(maxEdge) || maxEdge < 64 || maxEdge > 12000)
  )
    throw new Error("--max-edge 64 ile 12000 arasında tam sayı olmalı.");
  const html = await readFile(
    resolve(projectRoot, "tests/private-mockup-preview.html"),
  );
  const compositorSource = await readFile(compositor);
  const artworkBytes = await readFile(artworkPath);
  const browser = await chromium.launch({
    headless: !headed,
    ...(executablePath ? { executablePath } : {}),
  });
  let context;
  try {
    context = await browser.newContext({
      viewport: { width: 1440, height: 1060 },
      deviceScaleFactor: 1,
      acceptDownloads: true,
      serviceWorkers: "block",
    });
    const blockedRequests = [];
    const pageErrors = [];
    const servedAssets = new Set();
    const headers = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    await context.route("**/*", async (route) => {
      const request = route.request();
      let url;
      try {
        url = new URL(request.url());
      } catch {
        await route.abort("blockedbyclient");
        return;
      }
      if (url.origin !== privateOrigin || request.method() !== "GET") {
        blockedRequests.push(request.url());
        await route.abort("blockedbyclient");
        return;
      }
      try {
        if (url.pathname === "/") {
          await route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            headers: {
              ...headers,
              "Content-Security-Policy":
                "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; form-action 'none'",
            },
            body: html,
          });
        } else if (url.pathname === "/compositor.mjs") {
          await route.fulfill({
            status: 200,
            contentType: "text/javascript; charset=utf-8",
            headers,
            body: compositorSource,
          });
        } else if (url.pathname === "/config.json") {
          await route.fulfill({
            status: 200,
            contentType: "application/json; charset=utf-8",
            headers,
            body: JSON.stringify({
              manifest,
              maxEdge,
              artworkName: artworkPath.split(sep).at(-1),
            }),
          });
        } else if (url.pathname === "/artwork") {
          await route.fulfill({
            status: 200,
            contentType: contentType(artworkPath),
            headers,
            body: artworkBytes,
          });
        } else if (url.pathname.startsWith("/assets/")) {
          const requestedPath = decodeURIComponent(
            url.pathname.slice("/assets/".length),
          );
          if (
            !requestedPath ||
            isAbsolute(requestedPath) ||
            requestedPath.includes("\0")
          )
            throw new Error("Geçersiz kaynak yolu.");
          const file = await realpath(resolve(assetsRoot, requestedPath));
          if (
            !inside(assetsRoot, file) ||
            ![".png", ".jpg", ".jpeg", ".webp", ".json", ".bin"].includes(
              extname(file).toLowerCase(),
            )
          )
            throw new Error("Kaynak dosyaya izin verilmiyor.");
          const fileStat = await stat(file);
          if (!fileStat.isFile() || fileStat.size > 256 * 1024 * 1024)
            throw new Error("Kaynak dosya sınırı aşıldı.");
          servedAssets.add(requestedPath);
          await route.fulfill({
            status: 200,
            contentType: contentType(file),
            headers,
            body: await readFile(file),
          });
        } else {
          await route.fulfill({
            status: 404,
            contentType: "text/plain",
            headers,
            body: "Bulunamadı.",
          });
        }
      } catch {
        await route.fulfill({
          status: 404,
          contentType: "text/plain",
          headers,
          body: "Özel kaynak okunamadı.",
        });
      }
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${privateOrigin}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.privateMockup?.ready || window.privateMockup?.error,
      null,
      { timeout: 120_000 },
    );
    const state = await page.evaluate(() => ({
      ready: window.privateMockup.ready,
      error: window.privateMockup.error,
      width: window.privateMockup.width,
      height: window.privateMockup.height,
    }));
    if (!state.ready)
      throw new Error(state.error || "Yerel mockup hazırlanamadı.");
    if (pageErrors.length) throw new Error(pageErrors.join("\n"));
    return {
      browser,
      context,
      page,
      state,
      blockedRequests,
      pageErrors,
      servedAssets,
    };
  } catch (error) {
    await context?.close();
    await browser.close();
    throw error;
  }
}

function parseArgs(args) {
  const result = {};
  const supported = new Set([
    "assets",
    "artwork",
    "manifest",
    "output",
    "max-edge",
    "executable",
  ]);
  for (let index = 0; index < args.length; index++) {
    const option = args[index];
    if (["--help", "-h"].includes(option)) result.help = true;
    else if (option === "--ui") result.ui = true;
    else {
      const key = option.startsWith("--") ? option.slice(2) : "";
      if (
        !supported.has(key) ||
        !args[index + 1] ||
        args[index + 1].startsWith("--")
      )
        throw new Error(`Bilinmeyen veya eksik seçenek: ${option}`);
      result[key] = args[++index];
    }
  }
  return result;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    console.log(
      "Kullanım: node scripts/private-mockup-preview.mjs --assets /tmp/ozel-sahne --artwork /tmp/tasarim.png [--output /tmp/mockup-cikti] [--max-edge 2048] [--ui]\nKaynak PSD ve katmanlar proje klasörü dışında kalır. Yalnız birleştirilmiş PNG/JPG yazılır.",
    );
    return;
  }
  if (!options.assets || !options.artwork)
    throw new Error("--assets ve --artwork gerekli. Yardım: --help");
  const output = resolve(
    options.output || resolve(tmpdir(), `alacam-mockup-${Date.now()}`),
  );
  assertPrivate(output, "Çıktı klasörü");
  await mkdir(output, { recursive: true });
  assertPrivate(await realpath(output), "Çıktı klasörü");
  const session = await createPrivateMockupSession({
    assets: options.assets,
    artwork: options.artwork,
    manifest: options.manifest,
    maxEdge: options["max-edge"] ? Number(options["max-edge"]) : undefined,
    headed: Boolean(options.ui),
    executablePath:
      options.executable || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
  try {
    for (const [format, filename] of [
      ["image/png", "alacam-mockup.png"],
      ["image/jpeg", "alacam-mockup.jpg"],
    ]) {
      const data = await session.page.evaluate(
        (mime) => window.privateMockup.export(mime),
        format,
      );
      const bytes = Buffer.from(data.slice(data.indexOf(",") + 1), "base64");
      await writeFile(resolve(output, filename), bytes);
    }
    console.log(
      JSON.stringify(
        {
          width: session.state.width,
          height: session.state.height,
          png: resolve(output, "alacam-mockup.png"),
          jpg: resolve(output, "alacam-mockup.jpg"),
          externalRequests: session.blockedRequests.length,
          sourceFilesPublished: 0,
        },
        null,
        2,
      ),
    );
    if (options.ui) {
      console.log(
        "Yerel pencere açık. Bitirmek için pencereyi kapatın veya Ctrl+C kullanın.",
      );
      await Promise.race([
        new Promise((done) => session.page.once("close", done)),
        new Promise((done) => session.browser.once("disconnected", done)),
      ]);
    }
  } finally {
    await session.context.close().catch(() => {});
    await session.browser.close().catch(() => {});
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
