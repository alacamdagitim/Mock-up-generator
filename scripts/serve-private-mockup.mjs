#!/usr/bin/env node
/**
 * Loopback-only review page for a prepared, private mockup scene. Nothing is
 * copied into public/ or dist/, and only manifest-listed passes are served.
 */
import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_BYTES = 128 * 1024 * 1024;
const raster = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const types = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".bin": "application/octet-stream",
};
function inside(root, path) {
  const child = relative(root, path);
  return (
    child === "" ||
    (!isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`))
  );
}
async function boundedFile(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size > MAX_BYTES)
    throw new Error(
      "Özel mockup dosyası geçersiz veya 128 MB sınırını aşıyor.",
    );
  return readFile(path);
}
function privateDirectory(root) {
  if (inside(projectRoot, root) && !inside(resolve(projectRoot, "data"), root))
    throw new Error(
      "Proje içindeki özel sahneler yalnız git dışında tutulan data/ klasöründe olmalı.",
    );
}
export async function createPrivateMockupServer({
  assets,
  artwork,
  port = 0,
  maxEdge,
} = {}) {
  if (!assets || !artwork) throw new Error("--assets ve --artwork gerekli.");
  if (
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535 ||
    (port > 0 && port < 1024)
  )
    throw new Error("Port 0 veya 1024–65535 arasında olmalı.");
  if (
    maxEdge !== undefined &&
    (!Number.isInteger(maxEdge) || maxEdge < 64 || maxEdge > 12000)
  )
    throw new Error("--max-edge 64–12000 arasında olmalı.");
  const root = await realpath(resolve(assets));
  privateDirectory(root);
  const artworkPath = await realpath(resolve(artwork));
  if (!raster.has(extname(artworkPath).toLowerCase()))
    throw new Error("Tasarım görseli PNG, JPG veya WebP olmalı.");
  const manifestPath = await realpath(resolve(root, "manifest.json"));
  if (!inside(root, manifestPath))
    throw new Error("Manifest özel sahne klasöründe olmalı.");
  const manifestBytes = await boundedFile(manifestPath);
  if (manifestBytes.length > 2 * 1024 * 1024)
    throw new Error("Manifest en fazla 2 MB olabilir.");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (
    manifest.schemaVersion !== 1 ||
    !manifest.base ||
    manifest.lookup?.format !== "rg16le" ||
    !manifest.lookup.file ||
    !manifest.lookup.coverage
  )
    throw new Error(
      "Özel sahne manifesti taban, RG16 eşleme ve kapsam maskesi içermeli.",
    );
  const names = [
    manifest.base,
    manifest.lookup.file,
    manifest.lookup.coverage,
    ...(manifest.layers || []).map((layer) => layer.file),
  ];
  const files = new Map();
  for (const name of new Set(names)) {
    if (
      typeof name !== "string" ||
      !name ||
      name.includes("\\") ||
      name.includes("\0") ||
      isAbsolute(name)
    )
      throw new Error("Manifest geçersiz bir kaynak yolu içeriyor.");
    const path = await realpath(resolve(root, name));
    if (
      !inside(root, path) ||
      !(raster.has(extname(path).toLowerCase()) || extname(path) === ".bin")
    )
      throw new Error(
        "Kaynaklar özel sahne klasöründeki raster veya BIN dosyaları olmalı.",
      );
    files.set(name, {
      bytes: await boundedFile(path),
      type: types[extname(path).toLowerCase()],
    });
  }
  const artworkBytes = await boundedFile(artworkPath);
  if (artworkBytes.length > 32 * 1024 * 1024)
    throw new Error("Tasarım görseli en fazla 32 MB olabilir.");
  const html = await readFile(
    resolve(projectRoot, "tests/private-mockup-preview.html"),
  );
  const compositor = await readFile(
    resolve(projectRoot, "scripts/lib/private-mockup-compositor.mjs"),
  );
  const config = Buffer.from(
    JSON.stringify({
      manifest,
      maxEdge,
      artworkName: artworkPath.split(sep).at(-1),
    }),
  );
  let origin;
  const server = createServer((request, response) => {
    const headers = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    };
    const send = (status, body, type = "text/plain; charset=utf-8") => {
      response.writeHead(status, { ...headers, "Content-Type": type });
      response.end(request.method === "HEAD" ? undefined : body);
    };
    if (
      request.headers.host !== new URL(origin).host ||
      (request.headers.origin && request.headers.origin !== origin)
    )
      return send(403, "Yalnız yerel önizleme adresine izin verilir.");
    if (!["GET", "HEAD"].includes(request.method))
      return send(405, "Yalnız okuma isteği kabul edilir.");
    try {
      const url = new URL(request.url, origin);
      if (url.origin !== origin) return send(403, "Geçersiz adres.");
      if (url.pathname === "/")
        return send(200, html, "text/html; charset=utf-8");
      if (url.pathname === "/config.json")
        return send(200, config, "application/json; charset=utf-8");
      if (url.pathname === "/compositor.mjs")
        return send(200, compositor, "text/javascript; charset=utf-8");
      if (url.pathname === "/artwork")
        return send(
          200,
          artworkBytes,
          types[extname(artworkPath).toLowerCase()],
        );
      if (url.pathname.startsWith("/assets/")) {
        const file = files.get(decodeURIComponent(url.pathname.slice(8)));
        if (file) return send(200, file.bytes, file.type);
      }
      send(404, "Bulunamadı.");
    } catch {
      send(400, "Geçersiz istek.");
    }
  });
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", done);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    url: `${origin}/`,
    manifest,
    files: [...files.keys()],
    close: () =>
      new Promise((done, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : done()));
      }),
  };
}

async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help") {
      console.log(
        "node scripts/serve-private-mockup.mjs --assets data/prepared-mockups/sahne-r1 --artwork /ozel/tasarim.png [--port 5188] [--max-edge 1600]\nYalnız 127.0.0.1 üzerinde çalışır; kaynak katmanlar internete veya public/ içine aktarılmaz.",
      );
      return;
    }
    const key = args[i].replace(/^--/, "");
    if (
      !["assets", "artwork", "port", "max-edge"].includes(key) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--")
    )
      throw new Error(`Bilinmeyen veya eksik seçenek: ${args[i]}`);
    options[key] = args[++i];
  }
  const instance = await createPrivateMockupServer({
    ...options,
    port: Number(options.port || 5188),
    maxEdge: options["max-edge"] ? Number(options["max-edge"]) : undefined,
  });
  console.log(
    `Özel mockup önizlemesi: ${instance.url}\nKapatmak için Ctrl+C. Fotoğraf, maske ve UV kaynakları yalnız bu bilgisayardan okunur.`,
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      instance.close().finally(() => {
        process.exitCode = 0;
      });
    });
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
