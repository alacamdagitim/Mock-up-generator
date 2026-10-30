import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { get, list, put } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { z } from "zod";
import {
  DESIGN_ID,
  DesignApiError,
  MAX_DESIGN_BYTES,
  MAX_PREVIEW_BYTES,
  UPLOAD_TTL_MS,
  decodePngDataUrl,
  inlineDesignSchema,
  prepareDesignSchema,
  sha256,
  validateDesignDocument,
  validatePng,
} from "./design-contract.mjs";
import { publicApiBase } from "./design-http.mjs";

const PREFIX = "alacam-designs/v1";
const STORAGE_MARKER = `${PREFIX}/storage-check.json`;
const sessionSchema = prepareDesignSchema
  .extend({
    version: z.literal(1),
    id: z.string().regex(DESIGN_ID),
    expiresAt: z.number().int().positive(),
  })
  .strict();
const manifestSchema = prepareDesignSchema
  .extend({
    schemaVersion: z.literal(1),
    id: z.string().regex(DESIGN_ID),
    createdAt: z.string().datetime(),
  })
  .strict();

function requireStorage(env = process.env) {
  const token = env.BLOB_READ_WRITE_TOKEN;
  const base = publicApiBase(env);
  if (!token || !base)
    throw new DesignApiError(
      503,
      "Kalıcı tasarım depolaması bağlı değil. Vercel projesine özel Blob deposu bağlanmalı.",
    );
  return { token, base };
}

function pathname(id, file) {
  return `${PREFIX}/${id}/${file}`;
}

function signSession(value, token) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256", token)
    .update(`alacam-design-upload-v1:${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function readSession(session, token) {
  const denied = () => {
    throw new DesignApiError(
      400,
      "Tasarım yükleme oturumu geçersiz veya süresi dolmuş. Kaydı yeniden başlatın.",
    );
  };
  if (
    typeof session !== "string" ||
    session.length > 8192 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(session)
  )
    denied();
  const [payload, supplied] = session.split(".");
  const expected = createHmac("sha256", token)
    .update(`alacam-design-upload-v1:${payload}`)
    .digest();
  const signature = Buffer.from(supplied, "base64url");
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(signature, expected)
  )
    denied();
  let value;
  try {
    value = sessionSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
  } catch {
    denied();
  }
  if (value.expiresAt < Date.now()) denied();
  return value;
}

async function readPrivate(path, limit, token) {
  const result = await get(path, {
    access: "private",
    token,
    useCache: false,
    abortSignal: AbortSignal.timeout(25_000),
  });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  if (result.blob.size && result.blob.size > limit) {
    await result.stream.cancel();
    throw new DesignApiError(400, "Yüklenen dosya boyut sınırını aşıyor.");
  }
  const reader = result.stream.getReader(),
    chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new DesignApiError(400, "Yüklenen dosya boyut sınırını aşıyor.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}

async function readManifest(id, token) {
  const bytes = await readPrivate(pathname(id, "manifest.json"), 20_000, token);
  if (!bytes) return null;
  try {
    const result = manifestSchema.parse(JSON.parse(bytes.toString("utf8")));
    if (result.id !== id) throw new Error("Mismatch");
    return result;
  } catch {
    throw new DesignApiError(503, "Tasarım kayıt bilgisi okunamadı.");
  }
}

function savedReference(manifest, base) {
  return {
    id: manifest.id,
    designUrl: `${base}/api/designs/${manifest.id}/design.json`,
    previewUrl: `${base}/api/designs/${manifest.id}/preview.png`,
    productId: manifest.productId,
    variantId: manifest.variantId,
    ...(manifest.commerce ? { commerce: manifest.commerce } : {}),
    createdAt: manifest.createdAt,
  };
}

function sameUpload(manifest, session) {
  return (
    manifest.productId === session.productId &&
    manifest.variantId === session.variantId &&
    manifest.designSha256 === session.designSha256 &&
    manifest.previewSha256 === session.previewSha256 &&
    manifest.designBytes === session.designBytes &&
    manifest.previewBytes === session.previewBytes &&
    JSON.stringify(manifest.commerce) === JSON.stringify(session.commerce)
  );
}

async function commitManifest(session, token, base) {
  const existing = await readManifest(session.id, token);
  if (existing) {
    if (!sameUpload(existing, session))
      throw new DesignApiError(
        409,
        "Bu tasarım kimliği başka bir kayda bağlı.",
      );
    return savedReference(existing, base);
  }
  const { version: _version, expiresAt: _expiresAt, ...binding } = session;
  const manifest = {
    schemaVersion: 1,
    ...binding,
    createdAt: new Date().toISOString(),
  };
  try {
    await put(pathname(session.id, "manifest.json"), JSON.stringify(manifest), {
      access: "private",
      token,
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: false,
      abortSignal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    // Concurrent retries may have committed this exact immutable snapshot.
    const concurrent = await readManifest(session.id, token);
    if (concurrent && sameUpload(concurrent, session))
      return savedReference(concurrent, base);
    throw error;
  }
  return savedReference(manifest, base);
}

export async function prepareDesignUpload(input, env = process.env) {
  const { token } = requireStorage(env);
  const parsed = prepareDesignSchema.safeParse(input);
  if (!parsed.success)
    throw new DesignApiError(400, "Tasarım yükleme bilgileri geçersiz.");
  const id = randomBytes(24).toString("hex"),
    expiresAt = Date.now() + UPLOAD_TTL_MS;
  const session = { version: 1, id, expiresAt, ...parsed.data };
  const files = {
    design: {
      pathname: pathname(id, "design.json"),
      contentType: "application/json",
      bytes: parsed.data.designBytes,
    },
    preview: {
      pathname: pathname(id, "preview.png"),
      contentType: "image/png",
      bytes: parsed.data.previewBytes,
    },
  };
  const entries = await Promise.all(
    Object.entries(files).map(async ([name, file]) => [
      name,
      {
        pathname: file.pathname,
        contentType: file.contentType,
        token: await generateClientTokenFromReadWriteToken({
          token,
          pathname: file.pathname,
          validUntil: expiresAt,
          allowedContentTypes: [file.contentType],
          maximumSizeInBytes: file.bytes,
          addRandomSuffix: false,
          allowOverwrite: false,
        }),
      },
    ]),
  );
  return {
    id,
    session: signSession(session, token),
    expiresAt,
    uploads: Object.fromEntries(entries),
  };
}

export async function finalizeDesignUpload(input, env = process.env) {
  const { token, base } = requireStorage(env);
  if (
    !input ||
    typeof input !== "object" ||
    Object.keys(input).length !== 1 ||
    !("session" in input)
  )
    throw new DesignApiError(400, "Tasarım yükleme oturumu eksik.");
  const session = readSession(input.session, token);
  const existing = await readManifest(session.id, token);
  if (existing) {
    if (!sameUpload(existing, session))
      throw new DesignApiError(409, "Tasarım kaydı eşleşmiyor.");
    return savedReference(existing, base);
  }
  const [designBytes, preview] = await Promise.all([
    readPrivate(
      pathname(session.id, "design.json"),
      session.designBytes,
      token,
    ),
    readPrivate(
      pathname(session.id, "preview.png"),
      session.previewBytes,
      token,
    ),
  ]);
  if (!designBytes || !preview)
    throw new DesignApiError(
      409,
      "Tasarım dosyalarının yüklenmesi tamamlanmadı. Kaydı tekrar deneyin.",
    );
  if (
    designBytes.length !== session.designBytes ||
    preview.length !== session.previewBytes ||
    sha256(designBytes) !== session.designSha256 ||
    sha256(preview) !== session.previewSha256
  )
    throw new DesignApiError(
      400,
      "Yüklenen tasarım veya önizleme seçilen kayıtla eşleşmiyor.",
    );
  let design;
  try {
    design = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(designBytes),
    );
  } catch {
    throw new DesignApiError(400, "Tasarım JSON dosyası okunamadı.");
  }
  validateDesignDocument(design, session.productId);
  validatePng(preview);
  return commitManifest(session, token, base);
}

export async function saveInlineDesign(input, env = process.env) {
  const { token, base } = requireStorage(env);
  const parsed = inlineDesignSchema.safeParse(input);
  if (!parsed.success)
    throw new DesignApiError(400, "Geçersiz veya desteklenmeyen tasarım.");
  const { design, preview: previewUrl, ...binding } = parsed.data;
  const validated = validateDesignDocument(design, binding.productId),
    preview = decodePngDataUrl(previewUrl);
  const bytes = Buffer.from(JSON.stringify(validated));
  if (bytes.length > MAX_DESIGN_BYTES)
    throw new DesignApiError(413, "Tasarım dosyası çok büyük.");
  const id = randomBytes(24).toString("hex");
  const session = {
    version: 1,
    id,
    expiresAt: Date.now() + UPLOAD_TTL_MS,
    ...binding,
    designBytes: bytes.length,
    previewBytes: preview.length,
    designSha256: sha256(bytes),
    previewSha256: sha256(preview),
  };
  await Promise.all([
    put(pathname(id, "design.json"), bytes, {
      access: "private",
      token,
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: false,
      abortSignal: AbortSignal.timeout(25_000),
    }),
    put(pathname(id, "preview.png"), preview, {
      access: "private",
      token,
      contentType: "image/png",
      addRandomSuffix: false,
      allowOverwrite: false,
      abortSignal: AbortSignal.timeout(25_000),
    }),
  ]);
  return commitManifest(session, token, base);
}

export async function getSavedFile(id, file, env = process.env) {
  const { token } = requireStorage(env);
  if (!DESIGN_ID.test(id) || !["design.json", "preview.png"].includes(file))
    throw new DesignApiError(404, "Tasarım bulunamadı.");
  if (!(await readManifest(id, token)))
    throw new DesignApiError(404, "Tasarım bulunamadı.");
  const result = await get(pathname(id, file), {
    access: "private",
    token,
    abortSignal: AbortSignal.timeout(25_000),
  });
  if (!result || result.statusCode !== 200 || !result.stream)
    throw new DesignApiError(404, "Tasarım bulunamadı.");
  const maxBytes =
    file === "design.json" ? MAX_DESIGN_BYTES : MAX_PREVIEW_BYTES;
  if (!result.blob.size || result.blob.size > maxBytes) {
    await result.stream.cancel();
    throw new DesignApiError(503, "Tasarım dosyası okunamadı.");
  }
  return {
    stream: result.stream,
    contentType:
      file === "design.json" ? "application/json; charset=utf-8" : "image/png",
    size: result.blob.size,
  };
}

let healthCache;
function healthDefaults() {
  return {
    ok: true,
    schemaVersion: 1,
    uploadMode: "direct-blob",
    maxDesignBytes: MAX_DESIGN_BYTES,
    maxPreviewBytes: MAX_PREVIEW_BYTES,
  };
}

function privateBlobUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname.endsWith(".private.blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}

export async function connectDesignStorage(input, env = process.env) {
  const { token } = requireStorage(env);
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).length
  )
    throw new DesignApiError(
      400,
      "Depolama bağlantı isteği boş bir JSON nesnesi olmalı.",
    );
  // A POST may initialize this one non-personal marker. GET /health never
  // creates records. Private writes fail when the connected store is Public.
  const existing = await get(STORAGE_MARKER, {
    access: "private",
    token,
    useCache: false,
    abortSignal: AbortSignal.timeout(8000),
  });
  let verified = false;
  if (existing?.stream) {
    verified = privateBlobUrl(existing.blob.url);
    await existing.stream.cancel();
  }
  if (!verified) {
    try {
      const marker = await put(
        STORAGE_MARKER,
        '{"kind":"alacam-storage-check","schemaVersion":1}',
        {
          access: "private",
          token,
          contentType: "application/json",
          addRandomSuffix: false,
          allowOverwrite: false,
          abortSignal: AbortSignal.timeout(8000),
        },
      );
      verified = privateBlobUrl(marker.url);
    } catch {
      // Concurrent browsers can attempt the first connection together. Only
      // the first writes; the rest verify the exact immutable marker instead.
      const concurrent = await get(STORAGE_MARKER, {
        access: "private",
        token,
        useCache: false,
        abortSignal: AbortSignal.timeout(8000),
      });
      if (concurrent?.stream) {
        verified = privateBlobUrl(concurrent.blob.url);
        await concurrent.stream.cancel();
      }
    }
  }
  if (!verified)
    throw new DesignApiError(
      503,
      "Kalıcı depolama doğrulanamadı. Vercel Blob deposunun erişimi Private olmalı.",
    );
  const result = {
    ...healthDefaults(),
    storageConfigured: true,
    storageProvider: "vercel-blob-private",
  };
  healthCache = {
    key: sha256(token),
    until: Date.now() + 30_000,
    value: Promise.resolve(result),
  };
  return result;
}

export async function designStorageHealth(env = process.env) {
  const defaults = healthDefaults();
  if (!env.BLOB_READ_WRITE_TOKEN || !publicApiBase(env))
    return {
      ...defaults,
      storageConfigured: false,
      storageError: "Vercel özel Blob deposu bağlanmalı.",
    };
  const key = sha256(env.BLOB_READ_WRITE_TOKEN);
  if (
    !healthCache ||
    healthCache.key !== key ||
    healthCache.until < Date.now()
  ) {
    healthCache = {
      key,
      until: Date.now() + 30_000,
      value: (async () => {
        try {
          const result = await list({
            token: env.BLOB_READ_WRITE_TOKEN,
            limit: 1,
            abortSignal: AbortSignal.timeout(8000),
          });
          if (result.blobs.some((blob) => !privateBlobUrl(blob.url)))
            return {
              ...defaults,
              storageConfigured: false,
              storageError: "Tasarım deposunun erişimi Private olmalı.",
            };
          if (!result.blobs.length)
            return {
              ...defaults,
              storageConfigured: false,
              storageNeedsVerification: true,
              storageError:
                "Boş tasarım deposunun Private erişimi henüz doğrulanmadı.",
            };
          return {
            ...defaults,
            storageConfigured: true,
            storageProvider: "vercel-blob-private",
          };
        } catch {
          return {
            ...defaults,
            storageConfigured: false,
            storageError: "Kalıcı depolama bağlantısı doğrulanamadı.",
          };
        }
      })(),
    };
  }
  return healthCache.value;
}
