import DOMPurify from "dompurify";
import type { ArtboardSpec } from "./types";

const millimetres = (value: string | null) => {
  const match = /^\s*([\d.]+)\s*(mm|cm|in|pt)\s*$/i.exec(value || "");
  if (!match) return undefined;
  const scale: Record<string, number> = {
    mm: 1,
    cm: 10,
    in: 25.4,
    pt: 25.4 / 72,
  };
  const result = Number(match[1]) * scale[match[2].toLowerCase()];
  return Number.isFinite(result) && result > 0 && result <= 5000
    ? result
    : undefined;
};
export async function loadProductTemplate(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    signal,
    credentials: "omit",
    mode: "cors",
  });
  if (!response.ok)
    throw new Error(`Bıçak izi yüklenemedi (HTTP ${response.status}).`);
  if (Number(response.headers.get("content-length")) > 1_000_000)
    throw new Error("SVG bıçak izi en fazla 1 MB olabilir.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Bıçak izi okunamadı.");
  let raw = "",
    bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1_000_000)
        throw new Error("SVG bıçak izi en fazla 1 MB olabilir.");
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const clean = DOMPurify.sanitize(raw, {
    USE_PROFILES: { svg: true, svgFilters: false },
    FORBID_TAGS: [
      "script",
      "foreignObject",
      "image",
      "use",
      "style",
      "animate",
      "animateMotion",
      "animateTransform",
      "set",
      "a",
      "filter",
    ],
    FORBID_ATTR: ["style", "href", "xlink:href"],
  });
  const doc = new DOMParser().parseFromString(clean, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.localName !== "svg" || doc.querySelector("parsererror"))
    throw new Error(
      "Bu dosya SVG değil. SVG bıçak izi yükleyin; PDF/AI dosyasını indirme bağlantısından açabilirsiniz.",
    );
  for (const node of Array.from(doc.querySelectorAll("*")))
    for (const attribute of Array.from(node.attributes))
      if (
        /^on/i.test(attribute.name) ||
        /url\s*\(|javascript:|https?:|data:/i.test(attribute.value)
      )
        node.removeAttribute(attribute.name);
  const widthMm = millimetres(svg.getAttribute("width"));
  const heightMm = millimetres(svg.getAttribute("height"));
  const box = (svg.getAttribute("viewBox") || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const ratio =
    box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0
      ? box[2] / box[3]
      : widthMm && heightMm
        ? widthMm / heightMm
        : undefined;
  if (!ratio || ratio < 0.05 || ratio > 20)
    throw new Error("SVG'nin geçerli viewBox veya ölçü bilgisi gerekli.");
  if (widthMm && heightMm && Math.abs(ratio / (widthMm / heightMm) - 1) > 0.02)
    throw new Error(
      "SVG ölçüleri ve viewBox oranı uyuşmuyor; üretici şablonunu kontrol edin.",
    );
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  const artboard: ArtboardSpec = {
    canvasWidth: Math.round(ratio >= 1 ? 1200 : 1200 * ratio),
    canvasHeight: Math.round(ratio >= 1 ? 1200 / ratio : 1200),
    ...(widthMm && heightMm ? { widthMm, heightMm } : {}),
    sourceUrl: url,
  };
  return { artboard, svg: new XMLSerializer().serializeToString(doc) };
}
