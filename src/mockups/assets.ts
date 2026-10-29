/** Public, CORS-readable raster passes only. Browser fetch never carries cookies. */
export const MAX_SCENE_PIXELS = 16_777_216;
const MAX_ASSET_BYTES = 67_108_864;
const MAX_SCENE_BYTES = 160_000_000;
const MAX_DECODED_PIXELS = 64_000_000;
export type Raster = ImageBitmap;
export type AssetStore = {
  image: (url: string) => Promise<Raster>;
  binary: (url: string, expectedBytes: number) => Promise<ArrayBuffer>;
  dispose: () => void;
};
export function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException("Mockup işlemi iptal edildi.", "AbortError");
}
export function safeMockupUrl(value: string, base = location.href) {
  const url = new URL(value, base);
  const local =
    url.origin === location.origin &&
    ["http:", "https:"].includes(url.protocol);
  if ((!local && url.protocol !== "https:") || url.username || url.password)
    throw new Error("Mockup kaynağı güvenli bir HTTPS adresi olmalı.");
  if (/\.(?:svg|html?|js|mjs)(?:$|[?#])/i.test(url.pathname))
    throw new Error(
      "Mockup sahnesi yalnız PNG, JPG ve WebP görseller kullanabilir.",
    );
  return url.href;
}
function declaredSize(data: Uint8Array): {
  width: number;
  height: number;
  mime: string;
} {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (
    data.length >= 24 &&
    view.getUint32(0) === 0x89504e47 &&
    view.getUint32(4) === 0x0d0a1a0a
  )
    return {
      width: view.getUint32(16),
      height: view.getUint32(20),
      mime: "image/png",
    };
  if (
    data.length >= 30 &&
    view.getUint32(0) === 0x52494646 &&
    view.getUint32(8) === 0x57454250
  ) {
    const chunk = view.getUint32(12);
    if (chunk === 0x56503858)
      return {
        width: 1 + (data[24] | (data[25] << 8) | (data[26] << 16)),
        height: 1 + (data[27] | (data[28] << 8) | (data[29] << 16)),
        mime: "image/webp",
      };
    if (
      chunk === 0x56503820 &&
      data.length >= 30 &&
      data[23] === 0x9d &&
      data[24] === 0x01 &&
      data[25] === 0x2a
    )
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
        mime: "image/webp",
      };
    if (chunk === 0x5650384c && data[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
        mime: "image/webp",
      };
    }
  }
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < data.length) {
      if (data[offset++] !== 0xff) break;
      while (data[offset] === 0xff) offset++;
      const marker = data[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (offset + 2 > data.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > data.length) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      )
        return {
          width: view.getUint16(offset + 5),
          height: view.getUint16(offset + 3),
          mime: "image/jpeg",
        };
      offset += length;
    }
  }
  throw new Error(
    "Mockup kaynağı desteklenen bir PNG, JPG veya WebP dosyası değil.",
  );
}
export function createAssetStore(signal: AbortSignal): AssetStore {
  const images = new Map<string, Promise<Raster>>();
  const binaries = new Map<string, Promise<ArrayBuffer>>();
  const opened = new Set<Raster>();
  let bytes = 0,
    decodedPixels = 0,
    disposed = false;
  async function read(rawUrl: string, expectedBytes?: number) {
    checkAbort(signal);
    if (disposed) throw new DOMException("Sahne kapatıldı.", "AbortError");
    const url = safeMockupUrl(rawUrl);
    const response = await fetch(url, {
      signal,
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok || response.type === "opaque")
      throw new Error(
        "Mockup dosyası okunamadı. Adres ve CORS erişimini kontrol edin.",
      );
    safeMockupUrl(response.url || url);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_ASSET_BYTES || length + bytes > MAX_SCENE_BYTES)
      throw new Error("Mockup kaynakları dosya boyutu sınırını aşıyor.");
    if (!response.body) throw new Error("Mockup dosyası boş.");
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        total += next.value.byteLength;
        bytes += next.value.byteLength;
        if (
          total > MAX_ASSET_BYTES ||
          bytes > MAX_SCENE_BYTES ||
          (expectedBytes !== undefined && total > expectedBytes)
        )
          throw new Error("Mockup dosyası izin verilen boyutu aşıyor.");
        chunks.push(next.value);
        checkAbort(signal);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    if (!total || (expectedBytes !== undefined && total !== expectedBytes))
      throw new Error("Mockup eşleme dosyasının boyutu sahne ile uyuşmuyor.");
    const data = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    return data;
  }
  return {
    image(rawUrl) {
      const url = safeMockupUrl(rawUrl);
      if (!images.has(url))
        images.set(
          url,
          (async () => {
            const data = await read(url);
            const declared = declaredSize(data);
            const count = declared.width * declared.height;
            if (
              !declared.width ||
              !declared.height ||
              declared.width > 8192 ||
              declared.height > 8192 ||
              count > MAX_SCENE_PIXELS ||
              decodedPixels + count > MAX_DECODED_PIXELS
            )
              throw new Error("Mockup görselleri piksel sınırını aşıyor.");
            decodedPixels += count;
            const image = await createImageBitmap(
              new Blob([data as BlobPart], { type: declared.mime }),
              {
                imageOrientation: "none",
                premultiplyAlpha: "none",
                colorSpaceConversion: "default",
              },
            );
            if (disposed || signal.aborted) {
              image.close();
              checkAbort(signal);
              throw new DOMException("Sahne kapatıldı.", "AbortError");
            }
            if (
              image.width !== declared.width ||
              image.height !== declared.height
            ) {
              image.close();
              throw new Error("Mockup görsel ölçüleri doğrulanamadı.");
            }
            opened.add(image);
            return image;
          })(),
        );
      return images.get(url)!;
    },
    binary(rawUrl, expectedBytes) {
      const url = safeMockupUrl(rawUrl);
      if (!binaries.has(url))
        binaries.set(
          url,
          read(url, expectedBytes).then((value) => value.buffer as ArrayBuffer),
        );
      return binaries.get(url)!;
    },
    dispose() {
      disposed = true;
      for (const image of opened) image.close();
      opened.clear();
      images.clear();
      binaries.clear();
    },
  };
}
