import DOMPurify from "dompurify";
import type { Element } from "./types";
export const MAX_FILE = 8 * 1024 * 1024;
export async function imageFile(
  file: File,
): Promise<Pick<Element, "src" | "pixelWidth" | "pixelHeight" | "isVector">> {
  if (file.size > MAX_FILE) throw new Error("Dosya en fazla 8 MB olabilir.");
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!["png", "jpg", "jpeg", "svg"].includes(ext || ""))
    throw new Error("PNG, JPG veya SVG dosyası seçin.");
  let url: string;
  const vector = ext === "svg";
  if (vector) {
    const raw = await file.text();
    if (raw.length > 1_000_000) throw new Error("SVG en fazla 1 MB olabilir.");
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
    if (
      doc.querySelector("parsererror") ||
      doc.documentElement.localName !== "svg"
    )
      throw new Error("Geçerli bir SVG bulunamadı.");
    for (const el of Array.from(doc.querySelectorAll("*")))
      for (const at of Array.from(el.attributes))
        if (
          /url\s*\(|https?:|data:|javascript:|^on/i.test(at.value) ||
          /^on/i.test(at.name)
        )
          el.removeAttribute(at.name);
    url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(doc)], {
        type: "image/svg+xml",
      }),
    );
  } else {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const png =
      bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpg) throw new Error("Dosya içeriği PNG veya JPG değil.");
    url = URL.createObjectURL(file);
  }
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (img.naturalWidth * img.naturalHeight > 40_000_000)
      throw new Error("Görsel 40 megapiksel sınırını aşıyor.");
    const max = vector ? 2400 : 3200;
    const ratio = Math.min(
      1,
      max / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * ratio));
    c.height = Math.max(1, Math.round(img.naturalHeight * ratio));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const src = c.toDataURL("image/png");
    if (src.length > 8_000_000)
      throw new Error(
        "İşlenen görsel çok büyük; daha küçük bir görsel kullanın.",
      );
    return {
      src,
      pixelWidth: c.width,
      pixelHeight: c.height,
      isVector: vector,
    };
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Görsel okunamadı.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function pngBlob(data: string): Blob {
  const content = data.split(",")[1];
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}
