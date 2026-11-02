import { mockupSceneSchema } from "../../shared/mockup-scenes.mjs";
import { checkAbort, createAssetStore, MAX_SCENE_PIXELS } from "./assets";
import type { AssetStore } from "./assets";
import type { MockupScene, MockupTextures } from "./types";
import { sampleBilinear, sampleMinified, sampleUv16 } from "./sampling";
import type { PixelLevel } from "./sampling";
import { blurMockupLayer } from "./focus-blur";

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
    if (scene.backgroundControl) {
      assertDimensions(
        await assets.image(scene.backgroundControl.blackUrl),
        scene,
        "Arka plan tabanı",
      );
      assertDimensions(
        await assets.image(scene.backgroundControl.transmissionUrl),
        scene,
        "Arka plan renk eşlemesi",
      );
    }
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
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  temporary.width = temporary.height = 1;
  return data;
}
function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
const yieldFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
export async function composeMockup(
  loaded: LoadedMockup,
  textures: MockupTextures,
  options: {
    maxEdge?: number;
    antialias?: boolean;
    signal?: AbortSignal;
    artworkProvider?: ArtworkProvider;
    backgroundColor?: string;
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
  if (scene.backgroundControl && options.backgroundColor) {
    if (!/^#[0-9a-fA-F]{6}$/.test(options.backgroundColor))
      throw new Error("Arka plan rengi geçersiz.");
    const black = imagePixels(
      await assets.image(scene.backgroundControl.blackUrl),
      width,
      height,
    );
    const transmission = imagePixels(
      await assets.image(scene.backgroundControl.transmissionUrl),
      width,
      height,
    );
    const mapped = ctx.createImageData(width, height);
    const color = [1, 3, 5].map((i) =>
      parseInt(options.backgroundColor!.slice(i, i + 2), 16),
    );
    for (let i = 0; i < mapped.data.length; i += 4) {
      for (let c = 0; c < 3; c++)
        mapped.data[i + c] =
          black[i + c] + (transmission[i + c] * color[c]) / 255;
      mapped.data[i + 3] = black[i + 3];
    }
    ctx.putImageData(mapped, 0, 0);
  }
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
      const levels: PixelLevel[] = [
        {
          data: sourceContext.getImageData(0, 0, sourceWidth, sourceHeight)
            .data,
          width: sourceWidth,
          height: sourceHeight,
        },
      ];
      let previous = source;
      // Browser downsampling averages the full footprint before the nonlinear warp.
      // Export uses the same footprint filtering without changing its dimensions.
      if (options.antialias) {
        while (previous.width > 1 || previous.height > 1) {
          checkAbort(options.signal);
          const level = canvas(
              Math.max(1, Math.ceil(previous.width / 2)),
              Math.max(1, Math.ceil(previous.height / 2)),
            ),
            levelContext = context(level);
          levelContext.imageSmoothingEnabled = true;
          levelContext.imageSmoothingQuality = "high";
          levelContext.drawImage(previous, 0, 0, level.width, level.height);
          levels.push({
            data: levelContext.getImageData(0, 0, level.width, level.height)
              .data,
            width: level.width,
            height: level.height,
          });
          previous.width = previous.height = 1;
          previous = level;
        }
      }
      previous.width = previous.height = 1;
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
      const sampled = new Float64Array(4),
        scratch = new Float64Array(4),
        uv = new Float64Array(2),
        adjacent = new Float64Array(2),
        nativeStepX = scene.width / width,
        nativeStepY = scene.height / height;
      const readUv = (x: number, y: number, result: Float64Array) => {
        if (transform) {
          const px = (x + 0.5) * nativeStepX,
            py = (y + 0.5) * nativeStepY,
            denom = transform[6] * px + transform[7] * py + 1;
          result[0] =
            (transform[0] * px + transform[1] * py + transform[2]) / denom;
          result[1] =
            (transform[3] * px + transform[4] * py + transform[5]) / denom;
        } else if (uv16) {
          sampleUv16(
            uv16,
            scene.width,
            scene.height,
            (x + 0.5) * nativeStepX - 0.5,
            (y + 0.5) * nativeStepY - 0.5,
            result,
          );
        } else if (uv8) {
          const offset =
            (Math.max(0, Math.min(height - 1, y)) * width +
              Math.max(0, Math.min(width - 1, x))) *
            4;
          result[0] = uv8[offset] / 255;
          result[1] = uv8[offset + 1] / 255;
        } else throw new Error("Mockup baskı eşlemesi eksik.");
      };
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
          readUv(x, y, uv);
          const u = uv[0],
            v = uv[1];
          if (
            !Number.isFinite(u) ||
            !Number.isFinite(v) ||
            u < 0 ||
            u > 1 ||
            v < 0 ||
            v > 1
          )
            continue;
          if (uv8) coverage *= uv8[offset + 3] / 255;
          if (options.antialias) {
            let footprint = 1;
            for (let axis = 0; axis < 2; axis++) {
              readUv(
                x + (axis === 0 ? 1 : 0),
                y + (axis === 1 ? 1 : 0),
                adjacent,
              );
              let du = adjacent[0] - u,
                dv = adjacent[1] - v;
              // Outside a masked surface a UV map may contain zero/sentinel values.
              // A backwards derivative avoids smearing that discontinuity into the art.
              if (
                !Number.isFinite(du + dv) ||
                Math.abs(du) > 0.25 ||
                Math.abs(dv) > 0.25
              ) {
                readUv(
                  x - (axis === 0 ? 1 : 0),
                  y - (axis === 1 ? 1 : 0),
                  adjacent,
                );
                du = u - adjacent[0];
                dv = v - adjacent[1];
              }
              if (
                Number.isFinite(du + dv) &&
                Math.abs(du) <= 0.25 &&
                Math.abs(dv) <= 0.25
              )
                footprint = Math.max(
                  footprint,
                  Math.hypot(du * sourceWidth, dv * sourceHeight),
                );
            }
            sampleMinified(levels, u, v, footprint, sampled, scratch);
          } else {
            sampleBilinear(
              levels[0],
              u * (sourceWidth - 1),
              v * (sourceHeight - 1),
              sampled,
            );
          }
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
      if (surface.focusBlur)
        await blurMockupLayer(
          mapped.data,
          width,
          height,
          surface.focusBlur * scale,
          options.signal,
        );
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
