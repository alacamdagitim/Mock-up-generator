import { DesignApiError, MAX_INLINE_BYTES } from "./design-contract.mjs";

const DEFAULT_ORIGINS = [
  "https://alacamdagitim.com",
  "https://www.alacamdagitim.com",
  "https://mock-up-generator-y265.vercel.app",
];

function secureOrigin(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function publicApiBase(env = process.env) {
  if (env.PUBLIC_BASE_URL) return secureOrigin(env.PUBLIC_BASE_URL);
  const host = env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL;
  if (host) return secureOrigin(`https://${host}`);
  return "https://mock-up-generator-y265.vercel.app";
}

export function header(req, name) {
  const value = req.headers?.[name.toLowerCase()];
  return typeof value === "string" ? value : "";
}

export function allowDesignRequest(req, res, methods, env = process.env) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
  const allowed = new Set(DEFAULT_ORIGINS);
  for (const value of (env.ALLOWED_ORIGINS || "").split(",")) {
    const origin = secureOrigin(value.trim());
    if (origin) allowed.add(origin);
  }
  for (const host of [
    env.VERCEL_URL,
    env.VERCEL_BRANCH_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL,
  ]) {
    const origin = host && secureOrigin(`https://${host}`);
    if (origin) allowed.add(origin);
  }
  const base = publicApiBase(env);
  if (base) allowed.add(base);
  const origin = header(req, "origin");
  if (origin && !allowed.has(origin))
    throw new DesignApiError(403, "Bu mağaza kaynağına izin verilmiyor.");
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader(
    "Access-Control-Allow-Methods",
    [...methods, "OPTIONS"].join(", "),
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return false;
  }
  if (!methods.includes(req.method)) {
    res.setHeader("Allow", [...methods, "OPTIONS"].join(", "));
    throw new DesignApiError(405, "Bu istek yöntemi desteklenmiyor.");
  }
  return true;
}

// This limits a warm function instance; Vercel Firewall is the additional
// deployment-level control. It is intentionally not described as a global quota.
const windows = new Map();
export function limitDesignWrites(req, res) {
  const now = Date.now();
  if (windows.size > 2000)
    for (const [key, value] of windows)
      if (value.until <= now) windows.delete(key);
  if (windows.size > 3000)
    throw new DesignApiError(
      429,
      "Kayıt servisi meşgul. Biraz sonra tekrar deneyin.",
    );
  const address = (
    header(req, "x-vercel-forwarded-for") ||
    header(req, "x-forwarded-for") ||
    req.socket?.remoteAddress ||
    "unknown"
  )
    .split(",")[0]
    .trim()
    .slice(0, 100);
  let window = windows.get(address);
  if (!window || window.until <= now) {
    window = { until: now + 60_000, count: 0 };
    windows.set(address, window);
  }
  if (++window.count > 30) {
    res.setHeader(
      "Retry-After",
      String(Math.ceil((window.until - now) / 1000)),
    );
    throw new DesignApiError(
      429,
      "Çok fazla kayıt isteği. Bir dakika sonra tekrar deneyin.",
    );
  }
}

export function jsonResponse(res, status, value) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
}

export function apiError(res, error) {
  if (res.headersSent) {
    res.destroy(error);
    return;
  }
  if (error instanceof DesignApiError)
    return jsonResponse(res, error.status, { error: error.message });
  // Never include SDK errors or request bodies, which may contain credentials.
  console.error("Design storage:", error?.name || "Error");
  jsonResponse(res, 503, {
    error: "Kalıcı tasarım kaydı tamamlanamadı. Lütfen tekrar deneyin.",
  });
}

export async function readJsonBody(req, maxBytes = MAX_INLINE_BYTES) {
  if (!/^application\/json(?:\s*;|$)/i.test(header(req, "content-type")))
    throw new DesignApiError(415, "İstek application/json biçiminde olmalı.");
  if (
    header(req, "content-encoding") &&
    header(req, "content-encoding") !== "identity"
  )
    throw new DesignApiError(415, "Sıkıştırılmış kayıt isteği desteklenmiyor.");
  const size = Number(header(req, "content-length"));
  if (Number.isFinite(size) && size > maxBytes)
    throw new DesignApiError(
      413,
      "Bu kayıt doğrudan dosya yükleme akışıyla gönderilmeli.",
    );
  let bytes;
  if (req.body !== undefined) {
    if (Buffer.isBuffer(req.body)) bytes = req.body;
    else if (typeof req.body === "string") bytes = Buffer.from(req.body);
    else bytes = Buffer.from(JSON.stringify(req.body));
  } else {
    let length = 0;
    const chunks = [];
    for await (const chunk of req) {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += data.length;
      if (length > maxBytes)
        throw new DesignApiError(413, "Kayıt isteği boyut sınırını aşıyor.");
      chunks.push(data);
    }
    bytes = Buffer.concat(chunks);
  }
  if (bytes.length > maxBytes)
    throw new DesignApiError(413, "Kayıt isteği boyut sınırını aşıyor.");
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new DesignApiError(400, "JSON okunamadı.");
  }
}
