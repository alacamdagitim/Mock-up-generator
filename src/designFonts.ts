import { cache } from "fabric";
import type { Element } from "./types";

type TextFont = Pick<Element, "fontFamily" | "fontStyle" | "fontWeight">;
const loads = new Map<string, Promise<void>>();

export class DesignFontError extends Error {
  constructor() {
    super(
      "DM Sans yazı tipi yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.",
    );
    this.name = "DesignFontError";
  }
}

/** Fabric caches measured glyph widths, so await the real face before measuring. */
export function ensureDesignFont(font: TextFont): Promise<void> {
  if (font.fontFamily !== "DM Sans") return Promise.resolve();
  const style = font.fontStyle || "normal",
    weight = font.fontWeight || "normal",
    key = `${style}:${weight}`;
  const existing = loads.get(key);
  if (existing) return existing;

  let timer: ReturnType<typeof setTimeout>;
  const loaded = Promise.resolve().then(async () => {
    if (!document.fonts) throw new DesignFontError();
    const faces = await document.fonts.load(
      `${style} ${weight} 16px "DM Sans"`,
      "Alacam İıĞğŞşÇçÖöÜü",
    );
    if (!faces.length) throw new DesignFontError();
  });
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DesignFontError()), 10_000);
  });
  const ready = Promise.race([loaded, timeout])
    .then(() => {
      // Also remove any early fallback measurements from another canvas.
      cache.clearFontCache("DM Sans");
    })
    .catch(() => {
      loads.delete(key);
      throw new DesignFontError();
    })
    .finally(() => clearTimeout(timer));
  loads.set(key, ready);
  return ready;
}
