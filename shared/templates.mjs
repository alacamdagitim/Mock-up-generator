import { PRODUCT } from "./schema.mjs";
/** Reference guide only. Must never be sent to a cutter as a validated production dieline. */
export function referenceTemplateSvg({
  face = "both",
  print = true,
  safe = true,
} = {}) {
  if (!["front", "back", "both"].includes(face))
    throw new Error("Geçersiz yüz");
  const faces = face === "both" ? ["front", "back"] : [face],
    w = faces.length === 2 ? 318 : 164,
    h = 246;
  const sx = PRODUCT.widthMm / PRODUCT.canvasWidth,
    sy = PRODUCT.heightMm / PRODUCT.canvasHeight;
  const { x, y, width, height } = PRODUCT.print,
    inset = PRODUCT.safeInset;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"><title>Alaçam doypack örnek ölçü kılavuzu — üretim onaysız</title><metadata>${JSON.stringify({ schemaVersion: 1, modelId: PRODUCT.id, kind: "reference-guide", productionReady: false, widthMm: 140, heightMm: 210 })}</metadata><rect width="${w}" height="${h}" fill="white"/><g font-family="Arial, sans-serif" fill="#171717"><text x="12" y="8" font-size="3.8" font-weight="bold">ALAÇAM · ÖRNEK ÖLÇÜ KILAVUZU</text>${faces.map((f, i) => `<g transform="translate(${12 + i * 154} 21)"><text x="70" y="-5" text-anchor="middle" font-size="3.4">${f === "front" ? "ÖN YÜZ" : "ARKA YÜZ"} · 140 × 210 mm</text><rect width="140" height="210" rx="1" fill="#fafafa" stroke="#222" stroke-width=".3"/>${print ? `<rect x="${x * sx}" y="${y * sy}" width="${width * sx}" height="${height * sy}" fill="none" stroke="#8050d5" stroke-width=".35" stroke-dasharray="2 1"/>` : ""}${safe ? `<rect x="${(x + inset) * sx}" y="${(y + inset) * sy}" width="${(width - 2 * inset) * sx}" height="${(height - 2 * inset) * sy}" fill="none" stroke="#288766" stroke-width=".3" stroke-dasharray="1 1"/>` : ""}<path d="M0 8H140M0 17H140M0 195H140" fill="none" stroke="#aaa" stroke-width=".25"/><text x="70" y="205" text-anchor="middle" font-size="2.8" fill="#555">YAKLAŞIK MODEL · ÜRETİM ONAYSIZ</text></g>`).join("")}<text x="12" y="238" font-size="2.7">Siyah: ürün sınırı · Mor: baskı alanı · Yeşil: güvenli alan. Gerçek üretici kesim şablonu değildir.</text><text x="12" y="243" font-size="2.7">Ölçü ve mühür alanları örnektir. Kesim, katlama, taşma ve renk profili üretici tarafından doğrulanmalıdır.</text></g></svg>`;
}
