/** Persistent single-worker PSD ingestion. Source files are never public. */
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createWriteStream, createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  readdir,
  stat,
} from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { spawn } from "node:child_process";
import { brotliCompressSync, constants } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseMockupScenes } from "../shared/mockup-scenes.mjs";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const idOK = (v) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(v);
const safeEqual = (a, b) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const load = async (file) => JSON.parse(await readFile(file, "utf8"));
async function atomic(file, data) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temp, JSON.stringify(data), { mode: 0o600 });
  await rename(temp, file);
}
export async function createPsdService(options = {}) {
  const root = path.resolve(
    options.directory || process.env.PSD_DATA_DIR || "data/psd-service",
  );
  const token = options.token ?? process.env.PSD_ADMIN_TOKEN ?? "";
  const publicBase = (
    options.publicBase ??
    process.env.PSD_PUBLIC_BASE ??
    ""
  ).replace(/\/$/, "");
  const origins =
    options.origins ||
    String(
      process.env.PSD_ALLOWED_ORIGINS ||
        "http://127.0.0.1:5184,http://localhost:5184",
    ).split(",");
  if (
    token.length < 32 ||
    !publicBase ||
    (!publicBase.startsWith("/") && !publicBase.startsWith("https://"))
  )
    throw Error(
      "PSD_ADMIN_TOKEN (32+ karakter) ve PSD_PUBLIC_BASE (HTTPS veya yerel proxy yolu) gerekli.",
    );
  if (publicBase.startsWith("//") || publicBase.includes("\\"))
    throw Error("PSD_PUBLIC_BASE geçersiz.");
  const maxBytes = options.maxBytes || 268435456,
    maxJobs = options.maxJobs || 4096,
    quota =
      options.quotaBytes ||
      Number(process.env.PSD_STORAGE_QUOTA_BYTES || 8_589_934_592);
  const jobs = new Map();
  let processing = false,
    closing = false,
    active = null;
  await mkdir(path.join(root, "sources"), { recursive: true, mode: 0o700 });
  await mkdir(path.join(root, "jobs"), { recursive: true, mode: 0o700 });
  for (const name of await readdir(path.join(root, "jobs"))) {
    if (!/^[a-f0-9]{48}\.json$/.test(name)) continue;
    const job = await load(path.join(root, "jobs", name));
    if (["processing", "uploading"].includes(job.status)) job.status = "queued";
    jobs.set(job.id, job);
  }
  // Recover only our incomplete uploads; no other source directory is touched.
  for (const name of await readdir(path.join(root, "sources"))) {
    if (
      /^[a-f0-9]{48}\.part$/.test(name) ||
      (/^[a-f0-9]{48}\.psd$/.test(name) && !jobs.has(name.slice(0, -4)))
    )
      await rm(path.join(root, "sources", name), { force: true });
  }
  const persist = (job) =>
    atomic(path.join(root, "jobs", `${job.id}.json`), job);
  const productJobs = (product) =>
    [...jobs.values()]
      .filter((j) => j.productId === product)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const storedBytes = () =>
    [...jobs.values()].reduce(
      (sum, job) => sum + (job.sourceBytes || 0) + (job.preparedBytes || 0),
      0,
    );
  const pendingCount = () =>
    [...jobs.values()].filter((job) =>
      ["queued", "processing"].includes(job.status),
    ).length;
  const catalog = (product) => ({
    schemaVersion: 1,
    scenes: productJobs(product)
      .filter((j) => j.status === "ready")
      .map((j) => j.scene),
  });
  const summary = (job) => ({
    id: job.id,
    productId: job.productId,
    name: job.name,
    status: job.status,
    message: job.message || "",
    createdAt: job.createdAt,
    backgroundEditable: !!job.scene?.backgroundControl,
  });
  async function compile(job) {
    const output = path.join(root, "prepared", job.id);
    await rm(output, { recursive: true, force: true });
    if (options.processor) return options.processor(job, output);
    const args = [
      path.join(repo, "worker/import_psd.py"),
      "--source",
      path.join(root, "sources", `${job.id}.psd`),
      "--output",
      output,
    ];
    let logs = "";
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.env.PSD_PYTHON || "python3", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      active = child;
      const timer = setTimeout(
        () => child.kill("SIGKILL"),
        Number(process.env.PSD_JOB_TIMEOUT_MS || 600000),
      );
      child.stdout.on("data", (data) => {
        logs = (logs + data).slice(-12000);
      });
      child.stderr.on("data", () => {});
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        active = null;
        resolve(code);
      });
    });
    let report;
    try {
      report = JSON.parse(logs.trim().split("\n").at(-1));
    } catch {}
    if (result !== 0) {
      const e = Error(
        report?.message ||
          "PSD işlenemedi. Yapı veya bellek sınırı için inceleme gerekli.",
      );
      e.review = result === 2;
      throw e;
    }
    const scene = await load(path.join(output, "scene.json"));
    scene.title = job.name.replace(/\.psd$/i, "").slice(0, 120);
    const url = (name) =>
      `${publicBase}/assets/${job.id}/${encodeURIComponent(name)}`;
    scene.baseImageUrl = url(scene.baseImageUrl);
    scene.plainThumbnailUrl = url(scene.plainThumbnailUrl);
    for (const surface of scene.surfaces) {
      if (surface.mapping.type === "uv-rg16le") {
        const name = surface.mapping.url;
        const bytes = await readFile(path.join(output, name));
        await writeFile(
          path.join(output, `${name}.br`),
          brotliCompressSync(bytes, {
            params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
          }),
        );
        await rm(path.join(output, name));
        surface.mapping.url = url(`${name}.br`);
      }
      if (surface.maskUrl) surface.maskUrl = url(surface.maskUrl);
    }
    for (const layer of scene.layers || [])
      layer.imageUrl = url(layer.imageUrl);
    if (scene.backgroundControl) {
      scene.backgroundControl.blackUrl = url(scene.backgroundControl.blackUrl);
      scene.backgroundControl.transmissionUrl = url(
        scene.backgroundControl.transmissionUrl,
      );
    }
    return parseMockupScenes({ schemaVersion: 1, scenes: [scene] }).scenes[0];
  }
  async function drain() {
    if (processing || closing) return;
    processing = true;
    try {
      for (const job of jobs.values()) {
        if (closing) break;
        if (job.status !== "queued") continue;
        job.status = "processing";
        job.message =
          "Katmanlar, baskı alanları ve Photoshop önizlemesi doğrulanıyor…";
        await persist(job);
        try {
          job.scene = await compile(job);
          let preparedBytes = 0;
          const preparedDir = path.join(root, "prepared", job.id);
          for (const name of await readdir(preparedDir).catch(() => []))
            preparedBytes += (await stat(path.join(preparedDir, name))).size;
          if (storedBytes() + preparedBytes > quota)
            throw Error(
              "Kalıcı depolama kotası doldu. Eski PSD dosyalarını kaldırın.",
            );
          job.preparedBytes = preparedBytes;
          job.status = "ready";
          job.message = "Hazır";
        } catch (error) {
          job.status = closing ? "queued" : error.review ? "review" : "error";
          job.message = closing
            ? "Servis yeniden başladığında devam edilecek."
            : error.message.slice(0, 500);
          delete job.scene;
          await rm(path.join(root, "prepared", job.id), {
            recursive: true,
            force: true,
          });
        }
        await persist(job);
      }
    } finally {
      processing = false;
    }
  }
  const app = express();
  app.disable("x-powered-by");
  app.use(
    cors({
      origin: origins,
      methods: ["GET", "POST", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "no-referrer");
    next();
  });
  app.get("/health", (_req, res) =>
    res.json({
      ok: true,
      psdConfigured: true,
      storage: "persistent-directory",
      maxFileBytes: maxBytes,
      maxFilesPerProduct: 64,
      processingModel: "validated-subset",
    }),
  );
  app.get("/catalog/:productId", async (req, res) => {
    if (!idOK(req.params.productId))
      return res.status(400).json({ error: "Ürün kimliği geçersiz." });
    res.set("Cache-Control", "no-store");
    return res.json(catalog(req.params.productId));
  });
  app.get("/assets/:jobId/:file", async (req, res, next) => {
    const { jobId, file } = req.params,
      job = jobs.get(jobId);
    if (
      !job ||
      job.status !== "ready" ||
      !/^(?:base\.webp|thumbnail\.jpg|surface-\d+-(?:mask)\.png|surface-\d+\.uv\.bin\.br|effect-\d+\.png|background-(?:black|transmission)\.png)$/.test(
        file,
      )
    )
      return res.sendStatus(404);
    try {
      const target = path.join(root, "prepared", jobId, file),
        info = await stat(target);
      res.set("Cache-Control", "public, max-age=31536000, immutable");
      if (file.endsWith(".br")) {
        res.set("Content-Encoding", "br");
        res.type("application/octet-stream");
      } else res.type(path.extname(file));
      res.set("Content-Length", String(info.size));
      await pipeline(createReadStream(target), res);
    } catch (e) {
      if (e.code === "ENOENT") return res.sendStatus(404);
      next(e);
    }
  });
  app.use(
    "/admin",
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
  );
  app.use("/admin", (req, res, next) => {
    if (req.get("Origin") && !origins.includes(req.get("Origin")))
      return res.sendStatus(403);
    if (!safeEqual(req.get("Authorization") || "", `Bearer ${token}`))
      return res.status(401).json({ error: "Yönetici anahtarı gerekli." });
    next();
  });
  app.get("/admin/products/:productId", (req, res) => {
    if (!idOK(req.params.productId)) return res.sendStatus(400);
    res.set("Cache-Control", "no-store");
    res.json({
      jobs: productJobs(req.params.productId).map(summary),
      catalog: catalog(req.params.productId),
    });
  });
  let uploading = 0;
  app.post("/admin/products/:productId/import", async (req, res, next) => {
    const productId = req.params.productId,
      name = String(req.query.name || "");
    if (
      !idOK(productId) ||
      !name.toLowerCase().endsWith(".psd") ||
      name.length > 180 ||
      /[\/\\\x00-\x1f]/.test(name)
    )
      return res
        .status(400)
        .json({ error: "Ürün kimliği ve .psd dosya adı gerekli." });
    if (
      !/^application\/(?:octet-stream|vnd\.adobe\.photoshop)$/i.test(
        req.get("Content-Type") || "",
      )
    )
      return res
        .status(415)
        .json({ error: "PSD ikili dosya olarak yüklenmeli." });
    if (
      productJobs(productId).length >= 64 ||
      jobs.size >= maxJobs ||
      pendingCount() >= 64 ||
      storedBytes() + (uploading + 1) * maxBytes > quota ||
      uploading >= 2
    )
      return res.status(429).json({ error: "İçe aktarma kapasitesi dolu." });
    if (Number(req.get("Content-Length") || 0) > maxBytes)
      return res.status(413).json({ error: "PSD 256 MB sınırını aşıyor." });
    const id = randomBytes(24).toString("hex"),
      temp = path.join(root, "sources", `${id}.part`);
    let bytes = 0;
    const hash = createHash("sha256");
    let header = Buffer.alloc(0),
      invalidSignature = false;
    uploading++;
    try {
      const guard = new Transform({
        transform(chunk, _encoding, done) {
          bytes += chunk.length;
          if (bytes > maxBytes)
            return done(
              Object.assign(Error("Dosya boyutu sınırı aşıldı."), {
                status: 413,
              }),
            );
          if (header.length < 26)
            header = Buffer.concat([header, chunk]).subarray(0, 26);
          if (
            header.length >= 26 &&
            (header.subarray(0, 4).toString() !== "8BPS" ||
              header.readUInt16BE(4) !== 1)
          )
            invalidSignature = true;
          if (invalidSignature) return done(null, Buffer.alloc(0));
          hash.update(chunk);
          done(null, chunk);
        },
      });
      await pipeline(
        req,
        guard,
        createWriteStream(temp, { mode: 0o600, flags: "wx" }),
      );
      if (invalidSignature)
        throw Object.assign(Error("PSD dosya imzası geçersiz."), {
          status: 400,
        });
      if (bytes < 26)
        throw Object.assign(Error("PSD başlığı eksik."), { status: 400 });
      const sha = hash.digest("hex");
      const duplicate = productJobs(productId).find((j) => j.sha256 === sha);
      if (duplicate) {
        await rm(temp, { force: true });
        return res.status(200).json(summary(duplicate));
      }
      if (
        productJobs(productId).length >= 64 ||
        jobs.size >= maxJobs ||
        storedBytes() + bytes > quota
      )
        throw Object.assign(Error("İçe aktarma kapasitesi dolu."), {
          status: 429,
        });
      await rename(temp, path.join(root, "sources", `${id}.psd`));
      const job = {
        id,
        productId,
        name,
        sha256: sha,
        sourceBytes: bytes,
        status: "queued",
        createdAt: new Date().toISOString(),
      };
      jobs.set(id, job);
      await persist(job);
      res.status(202).json(summary(job));
      void drain();
    } catch (e) {
      await rm(temp, { force: true });
      if (e.status && !res.headersSent)
        res.status(e.status).json({ error: e.message });
      else next(e);
    } finally {
      uploading--;
    }
  });
  app.delete("/admin/jobs/:id", async (req, res, next) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.sendStatus(404);
    if (["processing", "queued"].includes(job.status))
      return res
        .status(409)
        .json({ error: "İşleme tamamlanmadan dosya kaldırılamaz." });
    try {
      await rm(path.join(root, "sources", `${job.id}.psd`), { force: true });
      await rm(path.join(root, "prepared", job.id), {
        recursive: true,
        force: true,
      });
      await rm(path.join(root, "jobs", `${job.id}.json`), { force: true });
      jobs.delete(job.id);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    res.status(500).json({ error: "PSD servisi işlemi tamamlayamadı." });
  });
  const api = {
    app,
    jobs,
    drain,
    close: async () => {
      closing = true;
      active?.kill("SIGTERM");
      while (processing) await new Promise((r) => setTimeout(r, 30));
    },
  };
  if (options.autoStart !== false) void drain();
  return api;
}
