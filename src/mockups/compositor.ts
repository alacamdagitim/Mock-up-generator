import { mockupSceneSchema } from "../../shared/mockup-scenes.mjs";
import { checkAbort, createAssetStore, MAX_SCENE_PIXELS } from "./assets";
import type { AssetStore } from "./assets";
import type { MockupScene, MockupTextures } from "./types";

export type ArtworkProvider = (
  face: "front" | "back",
  backgroundMode: "design" | "transparent",
) => HTMLCanvasElement | null | Promise<HTMLCanvasElement | null>;
export type LoadedMockup = {
  scene: MockupScene;
  assets: AssetStore;
  dispose: () => void;
};
function canvas(width: number, height: number) {
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  return output;
}
function context(output: HTMLCanvasElement) {
  const ctx = output.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Bu tarayıcı mockup tuvalini açamadı.");
  return ctx;
}
function assertDimensions(
  image: { width: number; height: number },
  scene: MockupScene,
  name: string,
) {
  if (image.width !== scene.width || image.height !== scene.height)
    throw new Error(
      `${name} ölçüleri sahneyle uyuşmuyor (${scene.width} × ${scene.height} px).`,
    );
}
export async function loadMockupScene(
  input: MockupScene,
  signal: AbortSignal,
): Promise<LoadedMockup> {
  const result = mockupSceneSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Mockup sahnesi geçersiz: ${result.error.issues[0]?.message || "Tanım okunamadı."}`,
    );
  const scene = result.data,
    assets = createAssetStore(signal);
  try {
    const base = await assets.image(scene.baseImageUrl);
    assertDimensions(base, scene, "Taban fotoğrafı");
    // Sequential decoding limits peak memory and stops immediately on bad passes.
    for (const surface of scene.surfaces) {
      if (surface.mapping.type === "uv-rg16le")
        await assets.binary(
          surface.mapping.url,
          scene.width * scene.height * 4,
        );
      if (surface.mapping.type === "uv-rg8")
        assertDimensions(
          await assets.image(surface.mapping.url),
          scene,
          "UV görseli",
        );
      if (surface.maskUrl)
        assertDimensions(
          await assets.image(surface.maskUrl),
          scene,
          "Baskı maskesi",
        );
      if (surface.shadingUrl)
        assertDimensions(
          await assets.image(surface.shadingUrl),
          scene,
          "Gölgeleme katmanı",
        );
    }
    for (const layer of scene.layers || [])
      assertDimensions(
        await assets.image(layer.imageUrl),
        scene,
        "Efekt katmanı",
      );
    checkAbort(signal);
    return { scene, assets, dispose: () => assets.dispose() };
  } catch (error) {
    assets.dispose();
    throw error;
  }
}
/** Solve destination pixel → normalized source projective transform. */
export function inverseQuad(points: ReadonlyArray<readonly [number, number]>) {
  const source = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    rows: number[][] = [];
  for (let index = 0; index < 4; index++) {
    const [x, y] = points[index],
      [u, v] = source[index];
    rows.push(
      [x, y, 1, 0, 0, 0, -u * x, -u * y, u],
      [0, 0, 0, x, y, 1, -v * x, -v * y, v],
    );
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++)
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    if (Math.abs(rows[pivot][col]) < 1e-10)
      throw new Error("Mockup baskı köşeleri geçerli bir alan oluşturmuyor.");
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const scale = rows[col][col];
    for (let item = col; item <= 8; item++) rows[col][item] /= scale;
    for (let row = 0; row < 8; row++)
      if (row !== col) {
        const factor = rows[row][col];
        for (let item = col; item <= 8; item++)
          rows[row][item] -= factor * rows[col][item];
      }
  }
  return rows.map((row) => row[8]);
}
function imagePixels(image: CanvasImageSource, width: number, height: number) {
  const temporary = canvas(width, height),
    ctx = context(temporary);
  ctx.drawImage(image, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  temporary.width = temporary.height = 1;
  return data;
}
function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
/** Premultiplied-alpha bilinear filtering preserves transparent logo edges. */
function sample(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  out: Float64Array,
) {
  x = Math.max(0, Math.min(width - 1, x));
  y = Math.max(0, Math.min(height - 1, y));
  const left = Math.floor(x),
    top = Math.floor(y),
    right = Math.min(width - 1, left + 1),
    bottom = Math.min(height - 1, top + 1);
  const a = (top * width + left) * 4,
    b = (top * width + right) * 4,
    c = (bottom * width + left) * 4,
    d = (bottom * width + right) * 4,
    tx = x - left,
    ty = y - top;
  const alpha = mix(
    mix(data[a + 3], data[b + 3], tx),
    mix(data[c + 3], data[d + 3], tx),
    ty,
  );
  out[3] = alpha;
  for (let channel = 0; channel < 3; channel++)
    out[channel] = alpha
      ? mix(
          mix(
            data[a + channel] * data[a + 3],
            data[b + channel] * data[b + 3],
            tx,
          ),
          mix(
            data[c + channel] * data[c + 3],
            data[d + channel] * data[d + 3],
            tx,
          ),
          ty,
        ) / alpha
      : 0;
}
const yieldFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
export async function composeMockup(
  loaded: LoadedMockup,
  textures: MockupTextures,
  options: {
    maxEdge?: number;
    signal?: AbortSignal;
    artworkProvider?: ArtworkProvider;
  } = {},
) {
  const { scene, assets } = loaded;
  checkAbort(options.signal);
  if (
    options.maxEdge !== undefined &&
    (!Number.isFinite(options.maxEdge) || options.maxEdge < 1)
  )
    throw new Error("Mockup önizleme ölçüsü geçersiz.");
  const scale = Math.min(
    1,
    (options.maxEdge || Math.max(scene.width, scene.height)) /
      Math.max(scene.width, scene.height),
  );
  const width = Math.max(1, Math.round(scene.width * scale)),
    height = Math.max(1, Math.round(scene.height * scale));
  const output = canvas(width, height),
    ctx = context(output);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const base = await assets.image(scene.baseImageUrl);
  ctx.drawImage(base, 0, 0, width, height);
  const artworkCache = new Map<string, Promise<HTMLCanvasElement | null>>();
  try {
    for (const surface of scene.surfaces) {
      checkAbort(options.signal);
      if (surface.backgroundMode === "transparent" && !options.artworkProvider)
        throw new Error(
          "Bu mockup saydam tasarım gerektiriyor; tasarım yüzeyi hazırlanamadı.",
        );
      const artworkKey = `${surface.face}:${surface.backgroundMode || "design"}`;
      if (!artworkCache.has(artworkKey))
        artworkCache.set(
          artworkKey,
          Promise.resolve(
            options.artworkProvider
              ? options.artworkProvider(
                  surface.face,
                  surface.backgroundMode || "design",
                )
              : textures[surface.face],
          ),
        );
      const artwork = await artworkCache.get(artworkKey)!;
      checkAbort(options.signal);
      if (!artwork)
        throw new Error(
          `${surface.face === "front" ? "Ön" : "Arka"} yüz tasarımı henüz hazırlanmadı.`,
        );
      if (
        !artwork.width ||
        !artwork.height ||
        artwork.width * artwork.height > MAX_SCENE_PIXELS
      )
        throw new Error("Tasarım görseli izin verilen piksel ölçüsünü aşıyor.");
      const rect = surface.sourceRect || { x: 0, y: 0, width: 1, height: 1 };
      const sourceWidth = Math.max(1, Math.round(artwork.width * rect.width)),
        sourceHeight = Math.max(1, Math.round(artwork.height * rect.height));
      const source = canvas(sourceWidth, sourceHeight),
        sourceContext = context(source);
      sourceContext.drawImage(
        artwork,
        rect.x * artwork.width,
        rect.y * artwork.height,
        rect.width * artwork.width,
        rect.height * artwork.height,
        0,
        0,
        sourceWidth,
        sourceHeight,
      );
      const sourcePixels = sourceContext.getImageData(
        0,
        0,
        sourceWidth,
        sourceHeight,
      ).data;
      source.width = source.height = 1;
      const overlay = canvas(width, height),
        overlayContext = context(overlay),
        mapped = overlayContext.createImageData(width, height);
      const mask = surface.maskUrl
        ? imagePixels(await assets.image(surface.maskUrl), width, height)
        : null;
      const shading = surface.shadingUrl
        ? imagePixels(await assets.image(surface.shadingUrl), width, height)
        : null;
      const uv8 =
        surface.mapping.type === "uv-rg8"
          ? imagePixels(await assets.image(surface.mapping.url), width, height)
          : null;
      const uv16 =
        surface.mapping.type === "uv-rg16le"
          ? new DataView(
              await assets.binary(
                surface.mapping.url,
                scene.width * scene.height * 4,
              ),
            )
          : null;
      const transform =
        surface.mapping.type === "quad"
          ? inverseQuad(surface.mapping.points)
          : null;
      const sampled = new Float64Array(4);
      for (let y = 0; y < height; y++) {
        if (y % 64 === 0) {
          checkAbort(options.signal);
          await yieldFrame();
        }
        for (let x = 0; x < width; x++) {
          const offset = (y * width + x) * 4;
          let coverage = mask
            ? (mask[offset] * mask[offset + 3]) / (255 * 255)
            : 1;
          if (!coverage) continue;
          let u: number, v: number;
          if (transform) {
            const px = (x + 0.5) / scale,
              py = (y + 0.5) / scale,
              denom = transform[6] * px + transform[7] * py + 1;
            u = (transform[0] * px + transform[1] * py + transform[2]) / denom;
            v = (transform[3] * px + transform[4] * py + transform[5]) / denom;
            if (
              !Number.isFinite(u) ||
              !Number.isFinite(v) ||
              u < 0 ||
              u > 1 ||
              v < 0 ||
              v > 1
            )
              continue;
          } else if (uv16) {
            const px = Math.min(scene.width - 1, Math.floor((x + 0.5) / scale)),
              py = Math.min(scene.height - 1, Math.floor((y + 0.5) / scale)),
              index = (py * scene.width + px) * 4;
            u = uv16.getUint16(index, true) / 65535;
            v = uv16.getUint16(index + 2, true) / 65535;
          } else if (uv8) {
            u = uv8[offset] / 255;
            v = uv8[offset + 1] / 255;
            coverage *= uv8[offset + 3] / 255;
          } else throw new Error("Mockup baskı eşlemesi eksik.");
          sample(
            sourcePixels,
            sourceWidth,
            sourceHeight,
            u * (sourceWidth - 1),
            v * (sourceHeight - 1),
            sampled,
          );
          for (let channel = 0; channel < 3; channel++)
            mapped.data[offset + channel] =
              sampled[channel] *
              (shading
                ? mix(
                    1,
                    shading[offset + channel] / 255,
                    shading[offset + 3] / 255,
                  )
                : 1);
          mapped.data[offset + 3] =
            sampled[3] * coverage * (surface.opacity ?? 1);
        }
      }
      checkAbort(options.signal);
      overlayContext.putImageData(mapped, 0, 0);
      ctx.globalCompositeOperation = surface.blend || "multiply";
      ctx.drawImage(overlay, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      overlay.width = overlay.height = 1;
    }
    for (const layer of scene.layers || []) {
      checkAbort(options.signal);
      ctx.globalAlpha = layer.opacity ?? 1;
      ctx.globalCompositeOperation = layer.blend;
      ctx.drawImage(await assets.image(layer.imageUrl), 0, 0, width, height);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    checkAbort(options.signal);
    return output;
  } catch (error) {
    output.width = output.height = 1;
    throw error;
  }
}
export function canvasDataUrl(
  output: HTMLCanvasElement,
  format: "image/png" | "image/jpeg",
) {
  return new Promise<string>((resolve, reject) => {
    let target = output;
    if (format === "image/jpeg") {
      target = canvas(output.width, output.height);
      const ctx = context(target);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, target.width, target.height);
      ctx.drawImage(output, 0, 0);
    }
    target.toBlob(
      (blob) => {
        if (target !== output) target.width = target.height = 1;
        if (!blob) {
          reject(new Error("Mockup görseli oluşturulamadı."));
          return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Mockup görseli okunamadı."));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      },
      format,
      0.95,
    );
  });
}
