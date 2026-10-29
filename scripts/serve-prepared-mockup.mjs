#!/usr/bin/env node
/** Loopback-only review using the production mockup engine through local Vite. */
import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMockupScenes } from "../shared/mockup-scenes.mjs";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, x) => {
    if (i % 2 === 0) a.push([v, x[i + 1]]);
    return a;
  }, []),
);
const root = await realpath(
  resolve(args["--assets"] || "data/prepared-mockups/tin-can-r1"),
);
const port = Number(args["--port"] || 5189),
  vite = new URL(args["--vite"] || "http://127.0.0.1:5184");
if (
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  !["localhost", "127.0.0.1"].includes(vite.hostname) ||
  vite.protocol !== "http:" ||
  vite.username ||
  vite.password ||
  vite.search ||
  vite.hash
)
  throw Error("Only a loopback development server is supported.");
const inside = (parent, child) => {
  const p = relative(parent, child);
  return p === "" || (!isAbsolute(p) && p !== ".." && !p.startsWith("../"));
};
if (inside(repo, root) && !inside(resolve(repo, "data"), root))
  throw Error(
    "Private assets inside the repository must remain in ignored data/.",
  );
const web = await realpath(resolve(root, "web"));
const catalog = parseMockupScenes(
  JSON.parse(await readFile(resolve(web, "catalog.local.json"), "utf8")),
);
if (catalog.scenes.length !== 1)
  throw Error("Choose a single prepared scene for this review.");
const scene = catalog.scenes[0];
const names = [
  scene.baseImageUrl,
  scene.plainThumbnailUrl,
  ...scene.surfaces.flatMap((s) => [s.mapping.url, s.maskUrl, s.shadingUrl]),
  ...(scene.layers || []).map((l) => l.imageUrl),
].filter(Boolean);
const files = new Map();
for (const name of names) {
  if (!name.startsWith("/assets/"))
    throw Error("Private scene must refer only to local /assets/ paths.");
  const path = await realpath(resolve(web, name.slice(8)));
  if (!inside(web, path) || !(await stat(path)).isFile())
    throw Error("Invalid prepared asset.");
  files.set(name, path);
}
const body = await realpath(resolve(root, "artwork-body.png")),
  lid = await realpath(resolve(root, "artwork-lid.png"));
if (!inside(root, body) || !inside(root, lid))
  throw Error("Example artwork must remain inside the scene directory.");
files.set("/artwork/front", body);
files.set("/artwork/back", lid);
const html = await readFile(resolve(repo, "tests/prepared-mockup-review.html"));
const configuration = Buffer.from(
  JSON.stringify({
    scene,
    moduleUrl: new URL("/src/mockups/compositor.ts", vite).href,
  }),
);
const types = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".bin": "application/octet-stream",
};
const server = createServer(async (req, res) => {
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
  };
  const send = (status, data, type = "text/plain; charset=utf-8") => {
    res.writeHead(status, { ...headers, "Content-Type": type });
    res.end(req.method === "HEAD" ? undefined : data);
  };
  try {
    if (
      req.headers.host !== `127.0.0.1:${port}` ||
      (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}`)
    )
      return send(403, "Only the local review origin is allowed.");
    if (!["GET", "HEAD"].includes(req.method)) return send(405, "Read only.");
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === "/")
      return send(200, html, "text/html; charset=utf-8");
    if (url.pathname === "/config.json")
      return send(200, configuration, "application/json");
    const file = files.get(url.pathname);
    if (!file) return send(404, "Not found.");
    const info = await stat(file);
    if (info.size > 67108864) return send(413, "Asset too large.");
    return send(
      200,
      await readFile(file),
      types[extname(file)] || "application/octet-stream",
    );
  } catch {
    return send(400, "Invalid private resource.");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Private prepared mockup: http://127.0.0.1:${port}/\nSource PSD is not served. Keep local Vite running.`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
