/**
 * Private, fixed-view mockup compositor. Source passes stay in a local isolated
 * browser context (or a private processing worker); only flattened outputs are
 * intended for publishing. This module contains no third-party image assets.
 */
const bitmaps = new Map();
const buffers = new Map();
const MAX_PIXELS = 16_000_000;

function checkAbort(signal) {
  if (signal?.aborted)
    throw new DOMException("İşlem iptal edildi.", "AbortError");
}
function dimension(value, name) {
  if (!Number.isInteger(value) || value < 1 || value > 12000)
    throw new Error(`${name} geçerli bir piksel ölçüsü olmalı.`);
  return value;
}
function validateManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1)
    throw new Error("Desteklenmeyen özel mockup sürümü.");
  const width = dimension(manifest.width, "Sahne eni");
  const height = dimension(manifest.height, "Sahne boyu");
  const sourceWidth = dimension(manifest.sourceWidth, "Tasarım eni");
  const sourceHeight = dimension(manifest.sourceHeight, "Tasarım boyu");
  if (width * height > MAX_PIXELS || sourceWidth * sourceHeight > MAX_PIXELS)
    throw new Error("Özel mockup piksel bütçesini aşıyor.");
  if (
    typeof manifest.base !== "string" ||
    manifest.lookup?.format !== "rg16le" ||
    typeof manifest.lookup.file !== "string" ||
    typeof manifest.lookup.coverage !== "string"
  )
    throw new Error("Taban, RG16 eşleme veya kapsam maskesi eksik.");
  if (
    manifest.layers !== undefined &&
    (!Array.isArray(manifest.layers) || manifest.layers.length > 16)
  )
    throw new Error("Mockup efekt katmanları geçersiz.");
  return { width, height, sourceWidth, sourceHeight };
}
async function bitmap(url) {
  if (!bitmaps.has(url)) {
    const promise = (async () => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    })().catch((error) => {
      bitmaps.delete(url);
      throw error;
    });
    bitmaps.set(url, promise);
  }
  return bitmaps.get(url);
}
async function binary(url) {
  if (!buffers.has(url)) {
    const promise = fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error("Özel eşleme dosyası okunamadı.");
        return response.arrayBuffer();
      })
      .catch((error) => {
        buffers.delete(url);
        throw error;
      });
    buffers.set(url, promise);
  }
  return buffers.get(url);
}
function canvas(width, height) {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  return element;
}
function pixels(image, width, height) {
  const output = canvas(width, height);
  const context = output.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  output.width = output.height = 1;
  return data;
}
const mix = (a, b, fraction) => a + (b - a) * fraction;

/** Bilinear sampling in premultiplied alpha avoids dark fringes on logos. */
function sample(data, width, height, x, y, output) {
  x = Math.max(0, Math.min(width - 1, x));
  y = Math.max(0, Math.min(height - 1, y));
  const left = Math.floor(x),
    top = Math.floor(y);
  const right = Math.min(left + 1, width - 1),
    bottom = Math.min(top + 1, height - 1);
  const tx = x - left,
    ty = y - top;
  const a = (top * width + left) * 4,
    b = (top * width + right) * 4;
  const c = (bottom * width + left) * 4,
    d = (bottom * width + right) * 4;
  const alpha = mix(
    mix(data[a + 3], data[b + 3], tx),
    mix(data[c + 3], data[d + 3], tx),
    ty,
  );
  output[3] = alpha;
  for (let channel = 0; channel < 3; channel++) {
    const upper = mix(
      data[a + channel] * data[a + 3],
      data[b + channel] * data[b + 3],
      tx,
    );
    const lower = mix(
      data[c + channel] * data[c + 3],
      data[d + channel] * data[d + 3],
      tx,
    );
    output[channel] = alpha > 0 ? mix(upper, lower, ty) / alpha : 0;
  }
}
const blends = {
  normal: (base, top) => top,
  multiply: (base, top) => (base * top) / 255,
  screen: (base, top) => 255 - ((255 - base) * (255 - top)) / 255,
  "linear-burn": (base, top) => Math.max(0, base + top - 255),
};

/**
 * RG16 lookup describes the fixed-view warp; its manifest must disclose whether
 * it was baked natively or approximately calibrated from cached artwork.
 * Coverage includes the relevant masks. Artwork is contained, never stretched.
 * Returned pixels remain at the source scene resolution; maxEdge only reduces.
 */
export async function composeMockup({
  manifest,
  assetUrl,
  artwork,
  maxEdge,
  signal,
}) {
  checkAbort(signal);
  const { width, height, sourceWidth, sourceHeight } =
    validateManifest(manifest);
  if (typeof assetUrl !== "function")
    throw new Error("Özel kaynak çözümleyicisi eksik.");
  if (maxEdge !== undefined && (!Number.isFinite(maxEdge) || maxEdge < 1))
    throw new Error("Önizleme boyutu geçersiz.");
  const [base, coverageImage, mapping] = await Promise.all([
    bitmap(assetUrl(manifest.base)),
    bitmap(assetUrl(manifest.lookup.coverage)),
    binary(assetUrl(manifest.lookup.file)),
  ]);
  checkAbort(signal);
  if (
    base.naturalWidth !== width ||
    base.naturalHeight !== height ||
    coverageImage.naturalWidth !== width ||
    coverageImage.naturalHeight !== height ||
    mapping.byteLength !== width * height * 4
  )
    throw new Error("Özel sahnenin piksel ölçüleri birbiriyle uyuşmuyor.");
  const coverage = pixels(coverageImage, width, height);
  const source = canvas(sourceWidth, sourceHeight);
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  const artworkWidth = artwork.naturalWidth || artwork.width;
  const artworkHeight = artwork.naturalHeight || artwork.height;
  if (
    !(artworkWidth > 0 && artworkHeight > 0) ||
    artworkWidth * artworkHeight > MAX_PIXELS
  )
    throw new Error("Tasarım görseli geçersiz veya piksel bütçesini aşıyor.");
  const fit = Math.min(
    sourceWidth / artworkWidth,
    sourceHeight / artworkHeight,
  );
  const fittedWidth = artworkWidth * fit,
    fittedHeight = artworkHeight * fit;
  sourceContext.drawImage(
    artwork,
    (sourceWidth - fittedWidth) / 2,
    (sourceHeight - fittedHeight) / 2,
    fittedWidth,
    fittedHeight,
  );
  const artworkPixels = sourceContext.getImageData(
    0,
    0,
    sourceWidth,
    sourceHeight,
  ).data;
  source.width = source.height = 1;
  const overlay = canvas(width, height);
  const overlayContext = overlay.getContext("2d", { willReadFrequently: true });
  const mapped = overlayContext.createImageData(width, height);
  const uv = new DataView(mapping),
    sampled = new Float64Array(4);
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    const coverageAlpha = (coverage[offset] * coverage[offset + 3]) / 255;
    if (!coverageAlpha) continue;
    const x = (uv.getUint16(offset, true) / 65535) * (sourceWidth - 1);
    const y = (uv.getUint16(offset + 2, true) / 65535) * (sourceHeight - 1);
    sample(artworkPixels, sourceWidth, sourceHeight, x, y, sampled);
    mapped.data[offset] = sampled[0];
    mapped.data[offset + 1] = sampled[1];
    mapped.data[offset + 2] = sampled[2];
    mapped.data[offset + 3] = (sampled[3] * coverageAlpha) / 255;
  }
  checkAbort(signal);
  for (const layer of manifest.layers || []) {
    const blend = blends[layer.blend || "normal"];
    if (!blend || typeof layer.file !== "string")
      throw new Error("Desteklenmeyen mockup efekti.");
    const image = await bitmap(assetUrl(layer.file));
    const x = layer.x ?? 0,
      y = layer.y ?? 0;
    const layerWidth = layer.width ?? image.naturalWidth,
      layerHeight = layer.height ?? image.naturalHeight;
    const opacity = layer.opacity ?? 1;
    if (
      ![x, y, layerWidth, layerHeight, opacity].every(Number.isFinite) ||
      opacity < 0 ||
      opacity > 1 ||
      layerWidth < 1 ||
      layerHeight < 1
    )
      throw new Error("Mockup efekt ölçüsü veya saydamlığı geçersiz.");
    const layerCanvas = canvas(width, height);
    const context = layerCanvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, x, y, layerWidth, layerHeight);
    const data = context.getImageData(0, 0, width, height).data;
    for (let offset = 0; offset < data.length; offset += 4) {
      if (!mapped.data[offset + 3] || !data[offset + 3]) continue;
      const alpha = (data[offset + 3] / 255) * opacity;
      for (let channel = 0; channel < 3; channel++)
        mapped.data[offset + channel] = mix(
          mapped.data[offset + channel],
          blend(mapped.data[offset + channel], data[offset + channel]),
          alpha,
        );
    }
    layerCanvas.width = layerCanvas.height = 1;
    checkAbort(signal);
  }
  overlayContext.putImageData(mapped, 0, 0);
  const output = canvas(width, height),
    context = output.getContext("2d");
  context.drawImage(base, 0, 0);
  context.drawImage(overlay, 0, 0);
  overlay.width = overlay.height = 1;
  checkAbort(signal);
  const scale = Math.min(
    1,
    (maxEdge || Math.max(width, height)) / Math.max(width, height),
  );
  if (scale === 1) return output;
  const reduced = canvas(
    Math.max(1, Math.round(width * scale)),
    Math.max(1, Math.round(height * scale)),
  );
  reduced
    .getContext("2d")
    .drawImage(output, 0, 0, reduced.width, reduced.height);
  output.width = output.height = 1;
  return reduced;
}
