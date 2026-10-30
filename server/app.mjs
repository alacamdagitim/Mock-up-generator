import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { designSchema } from "../shared/schema.mjs";
import { commerceSnapshotSchema } from "./design-contract.mjs";
const pngSchema = z
  .string()
  .max(6_000_000)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
const bodySchema = z
  .object({
    design: designSchema,
    preview: pngSchema,
    productId: z.string().min(1).max(100),
    variantId: z.string().regex(/^\d+$/).nullable(),
    commerce: commerceSnapshotSchema.optional(),
  })
  .strict();
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function decodePng(value) {
  const data = Buffer.from(value.split(",")[1], "base64");
  if (data.length < 24 || !data.subarray(0, 8).equals(PNG))
    throw new Error("PNG içeriği geçersiz");
  const w = data.readUInt32BE(16),
    h = data.readUInt32BE(20);
  if (!w || !h || w > 16000 || h > 16000 || w * h > 40_000_000)
    throw new Error("Görsel boyutları geçersiz");
  return data;
}
export function createApp(options = {}) {
  const directory = options.storageDir ?? process.env.DESIGN_STORAGE_DIR;
  const publicBase = options.publicBase ?? process.env.PUBLIC_BASE_URL;
  const origins =
    options.origins ??
    (
      process.env.ALLOWED_ORIGINS ||
      "http://127.0.0.1:5184,http://localhost:5184,http://127.0.0.1:5173,http://localhost:5173"
    )
      .split(",")
      .map((s) => s.trim());
  const configured = !!directory && !!publicBase;
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use((req, res, next) => {
    const origin = req.get("Origin");
    if (origin && !origins.includes(origin))
      return res
        .status(403)
        .json({ error: "Bu mağaza kaynağına izin verilmiyor." });
    next();
  });
  app.use(
    cors({
      origin: origins,
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type"],
    }),
  );
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "Çok fazla istek. Bir dakika sonra tekrar deneyin." },
    }),
  );
  app.use(express.json({ limit: "24mb" }));
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, storageConfigured: configured, schemaVersion: 1, uploadMode: "inline" }),
  );
  app.post("/api/designs", async (req, res, next) => {
    if (!configured)
      return res
        .status(503)
        .json({ error: "Sunucu depolaması yapılandırılmamış." });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Geçersiz veya desteklenmeyen tasarım." });
    if (parsed.data.design.productId !== parsed.data.productId)
      return res.status(400).json({ error: "Tasarım seçilen ürüne ait değil." });
    let tmp;
    try {
      const data = parsed.data,
        preview = decodePng(data.preview);
      for (const face of Object.values(data.design.faces))
        for (const el of face) if (el.kind === "image") decodePng(el.src);
      const id = randomBytes(24).toString("hex");
      const createdAt = new Date().toISOString();
      const root = path.resolve(directory);
      tmp = path.join(root, `.${id}.tmp`);
      await mkdir(root, { recursive: true, mode: 0o700 });
      await mkdir(tmp, { mode: 0o700 });
      await writeFile(
        path.join(tmp, "design.json"),
        JSON.stringify(data.design),
        { mode: 0o600 },
      );
      await writeFile(path.join(tmp, "preview.png"), preview, { mode: 0o600 });
      await writeFile(
        path.join(tmp, "metadata.json"),
        JSON.stringify({
          createdAt,
          productId: data.productId,
          variantId: data.variantId,
          ...(data.commerce ? { commerce: data.commerce } : {}),
        }),
        { mode: 0o600 },
      );
      await rename(tmp, path.join(root, id));
      tmp = null;
      const base = publicBase.replace(/\/$/, "");
      res.status(201).json({
        id,
        designUrl: `${base}/api/designs/${id}/design.json`,
        previewUrl: `${base}/api/designs/${id}/preview.png`,
        productId: data.productId,
        variantId: data.variantId,
        ...(data.commerce ? { commerce: data.commerce } : {}),
        createdAt,
      });
    } catch (err) {
      if (tmp) await rm(tmp, { recursive: true, force: true });
      if (err.message.includes("PNG") || err.message.includes("boyut"))
        return res.status(400).json({ error: err.message });
      next(err);
    }
  });
  app.get("/api/designs/:id/:file", async (req, res, next) => {
    if (!configured)
      return res.status(503).json({ error: "Depolama bağlı değil." });
    if (
      !/^[a-f0-9]{48}$/.test(req.params.id) ||
      !["design.json", "preview.png"].includes(req.params.file)
    )
      return res.status(404).json({ error: "Tasarım bulunamadı." });
    try {
      const data = await readFile(
        path.join(path.resolve(directory), req.params.id, req.params.file),
      );
      res.set("Cache-Control", "private, max-age=3600");
      res.set("X-Robots-Tag", "noindex, nofollow");
      res.type(req.params.file === "preview.png" ? "png" : "json").send(data);
    } catch (e) {
      if (e.code === "ENOENT")
        return res.status(404).json({ error: "Tasarım bulunamadı." });
      next(e);
    }
  });
  app.use((err, _req, res, _next) => {
    if (err.type === "entity.too.large")
      return res
        .status(413)
        .json({ error: "Toplam kayıt 24 MB sınırını aşıyor." });
    if (err instanceof SyntaxError)
      return res.status(400).json({ error: "JSON okunamadı." });
    console.error("Design API:", err.code || err.name);
    res
      .status(500)
      .json({ error: "Sunucu kaydı tamamlanamadı. Lütfen tekrar deneyin." });
  });
  return app;
}
