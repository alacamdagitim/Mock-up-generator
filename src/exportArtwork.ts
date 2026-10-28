import DOMPurify from "dompurify";
import { renderFace } from "./Editor";
import type { Design, Face } from "./types";
import { faceBackground } from "../shared/surface-colors.mjs";

export type ArtworkExportFormat = "svg" | "png" | "pdf";
export type ArtworkExportKind = "artwork" | "dieline";

const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );

/** Only the editor's already sanitized, locally generated template is accepted. */
export async function readExportTemplate(url?: string, signal?: AbortSignal) {
  if (!url) return null;
  const parsedUrl = new URL(url, location.href);
  if (parsedUrl.protocol !== "blob:" || parsedUrl.origin !== location.origin)
    throw new Error("Şablon önizlemesi için güvenli SVG henüz hazır değil.");
  const response = await fetch(parsedUrl, { signal });
  if (!response.ok) throw new Error("Bıçak izi önizlemesi okunamadı.");
  const blob = await response.blob();
  if (blob.size > 1_000_000)
    throw new Error("SVG bıçak izi 1 MB sınırını aşıyor.");
  const clean = DOMPurify.sanitize(await blob.text(), {
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
  const document = new DOMParser().parseFromString(clean, "image/svg+xml");
  if (
    document.documentElement.localName !== "svg" ||
    document.querySelector("parsererror")
  )
    throw new Error("Bıçak izi SVG biçiminde değil.");
  for (const node of Array.from(document.querySelectorAll("*")))
    for (const attribute of Array.from(node.attributes))
      if (
        /^on/i.test(attribute.name) ||
        /url\s*\(|javascript:|https?:|data:/i.test(attribute.value)
      )
        node.removeAttribute(attribute.name);
  return new XMLSerializer().serializeToString(document.documentElement);
}

export function artworkDimensions(design: Design) {
  const width = design.artboard?.canvasWidth || 600;
  const height = design.artboard?.canvasHeight || 900;
  return {
    width,
    height,
    widthMm: design.artboard?.widthMm,
    heightMm: design.artboard?.heightMm,
  };
}

function templateLayer(template: string, width: number, height: number) {
  const document = new DOMParser().parseFromString(template, "image/svg+xml");
  const svg = document.documentElement;
  svg.setAttribute("x", "0");
  svg.setAttribute("y", "0");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  return new XMLSerializer().serializeToString(svg);
}

export async function createArtworkSvg({
  design,
  face,
  template,
  kind,
  longestEdge = 2048,
}: {
  design: Design;
  face: Face;
  template?: string | null;
  kind: ArtworkExportKind;
  longestEdge?: number;
}) {
  const { width, height, widthMm, heightMm } = artworkDimensions(design);
  if (kind === "dieline" && !template)
    throw new Error("Bu ürün için görüntülenebilir SVG bıçak izi bulunamadı.");
  let artwork = "";
  if (kind === "artwork") {
    const canvas = await renderFace(
      design.faces[face],
      faceBackground(design, face),
      Math.min(4096, Math.max(600, longestEdge)) / Math.max(width, height),
      design.artboard,
    );
    artwork = `<image x="0" y="0" width="${width}" height="${height}" href="${canvas.toDataURL("image/png")}"/>`;
    canvas.width = canvas.height = 1;
  }
  const physical =
    widthMm && heightMm
      ? `width="${widthMm}mm" height="${heightMm}mm"`
      : `width="${width}px" height="${height}px"`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" ${physical} viewBox="0 0 ${width} ${height}"><title>${escapeXml(design.name)} · ${face === "front" ? "Ön" : "Arka"}</title><desc>RGB tasarım inceleme çıktısı. Üretim onayı verilmemiştir. Tasarım katmanı gömülü PNG'dir.</desc>${kind === "dieline" ? `<rect width="${width}" height="${height}" fill="white"/>` : ""}<g id="artwork">${artwork}</g>${template ? `<g id="dieline">${templateLayer(template, width, height)}</g>` : ""}</svg>`;
}

export async function rasterizeArtwork(
  svg: string,
  design: Design,
  longestEdge: number,
) {
  const { width, height } = artworkDimensions(design);
  const canvas = document.createElement("canvas");
  const scale = Math.min(4096, longestEdge) / Math.max(width, height);
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const source = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml" }),
  );
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = source;
    await image.decode();
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Bu cihazda görsel çıktısı oluşturulamadı.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(source);
  }
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: "image/png" | "image/jpeg",
) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Görsel dosyası oluşturulamadı.")),
      type,
      0.98,
    ),
  );
}

/** Small, valid PDF 1.4 writer. The RGB page embeds the rendered image, not editable vectors. */
async function artworkPdf(canvas: HTMLCanvasElement, design: Design) {
  const imageCanvas = document.createElement("canvas");
  imageCanvas.width = canvas.width;
  imageCanvas.height = canvas.height;
  const context = imageCanvas.getContext("2d");
  if (!context) throw new Error("PDF görseli oluşturulamadı.");
  context.fillStyle = "white";
  context.fillRect(0, 0, imageCanvas.width, imageCanvas.height);
  context.drawImage(canvas, 0, 0);
  const jpeg = new Uint8Array(
    await (await canvasBlob(imageCanvas, "image/jpeg")).arrayBuffer(),
  );
  imageCanvas.width = imageCanvas.height = 1;
  const { width, height, widthMm, heightMm } = artworkDimensions(design);
  const pageWidth =
    widthMm && heightMm ? (widthMm * 72) / 25.4 : (width * 72) / 96;
  const pageHeight =
    widthMm && heightMm ? (heightMm * 72) / 25.4 : (height * 72) / 96;
  const encode = (text: string) => new TextEncoder().encode(text);
  const content = `q\n${pageWidth.toFixed(5)} 0 0 ${pageHeight.toFixed(5)} 0 0 cm\n/Artwork Do\nQ\n`;
  const imageHeader = encode(
    `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  const imageFooter = encode("\nendstream");
  const imageObject = new Uint8Array(
    imageHeader.length + jpeg.length + imageFooter.length,
  );
  imageObject.set(imageHeader);
  imageObject.set(jpeg, imageHeader.length);
  imageObject.set(imageFooter, imageHeader.length + jpeg.length);
  const objects: Uint8Array[] = [
    encode("<< /Type /Catalog /Pages 2 0 R >>"),
    encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    encode(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(5)} ${pageHeight.toFixed(5)}] /Resources << /XObject << /Artwork 4 0 R >> >> /Contents 5 0 R >>`,
    ),
    imageObject,
    encode(
      `<< /Length ${encode(content).length} >>\nstream\n${content}endstream`,
    ),
  ];
  const chunks: BlobPart[] = ["%PDF-1.4\n%RGB artwork preview\n"];
  const offsets = [0];
  let length = encode(String(chunks[0])).length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const prefix = encode(`${index + 1} 0 obj\n`),
      suffix = encode("\nendobj\n");
    chunks.push(prefix, object, suffix);
    length += prefix.length + object.length + suffix.length;
  });
  const xref = length;
  chunks.push(
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
      .join(
        "",
      )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  return new Blob(chunks, { type: "application/pdf" });
}

export async function createArtworkExport(
  options: Parameters<typeof createArtworkSvg>[0] & {
    format: ArtworkExportFormat;
  },
) {
  const svg = await createArtworkSvg(options);
  if (options.format === "svg")
    return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const canvas = await rasterizeArtwork(
    svg,
    options.design,
    options.longestEdge || 2048,
  );
  try {
    return options.format === "pdf"
      ? await artworkPdf(canvas, options.design)
      : await canvasBlob(canvas, "image/png");
  } finally {
    canvas.width = canvas.height = 1;
  }
}

export function downloadExport(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Safari may start reading the object URL after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadEditableDesign(design: Design) {
  downloadExport(
    new Blob([JSON.stringify(design, null, 2)], { type: "application/json" }),
    `${exportFilename(design.name)}.json`,
  );
}

export function exportFilename(name: string) {
  return (
    name
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .trim()
      .slice(0, 80) || "alacam-tasarim"
  );
}
