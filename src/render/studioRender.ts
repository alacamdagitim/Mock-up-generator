import * as THREE from "three";
import { renderDenoisedResult } from "./denoise";
import { configureRenderSampling } from "./sampling";
import { renderTextureSize } from "../../shared/render-quality.mjs";
import { outputDimensions, renderTiles } from "../../shared/render-output.mjs";
import type {
  RenderContext,
  RenderOptions,
  RenderResult,
  RenderSnapshot,
} from "./types";
import {
  createStudioBackdrop,
  createStudioBackground,
  createStudioEnvironment,
} from "./studioEnvironment";

type PathTracer = import("three-gpu-pathtracer").WebGLPathTracer;
const abortError = () => new DOMException("Render iptal edildi.", "AbortError");

function frame(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const id = requestAnimationFrame(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    });
    const cancel = () => {
      cancelAnimationFrame(id);
      signal?.removeEventListener("abort", cancel);
      reject(abortError());
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

function encode(
  canvas: HTMLCanvasElement,
  format: "png" | "jpeg",
  signal?: AbortSignal,
) {
  return new Promise<Blob>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const cancel = () => {
      signal?.removeEventListener("abort", cancel);
      reject(abortError());
    };
    signal?.addEventListener("abort", cancel, { once: true });
    canvas.toBlob(
      (blob) => {
        signal?.removeEventListener("abort", cancel);
        if (signal?.aborted) reject(abortError());
        else if (blob) resolve(blob);
        else reject(new Error("Görsel dosyası oluşturulamadı."));
      },
      format === "jpeg" ? "image/jpeg" : "image/png",
      0.94,
    );
  });
}

/** Keep the captured orbit/pan/zoom; retreat only if a new aspect crops it. */
function fitAspect(
  camera: THREE.PerspectiveCamera,
  bounds: THREE.Box3,
  aspect: number,
) {
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.zoom;
  const tanX = tanY * aspect;
  let retreat = 0;
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const p = new THREE.Vector3(x, y, z).applyMatrix4(
          camera.matrixWorldInverse,
        );
        retreat = Math.max(
          retreat,
          Math.abs(p.x) / (tanX * 0.93) + p.z,
          Math.abs(p.y) / (tanY * 0.93) + p.z,
          p.z + 0.1,
        );
      }
  if (retreat > 0)
    camera.position.addScaledVector(
      new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion),
      retreat,
    );
  camera.near = 0.03;
  camera.far = Math.max(
    100,
    camera.position.distanceTo(bounds.getCenter(new THREE.Vector3())) +
      bounds.getSize(new THREE.Vector3()).length() * 20,
  );
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

/**
 * A separate offline WebGL2 path-tracing job. The UI must supply a fresh canvas
 * for each job and show the returned Blob afterwards; the job releases its GL
 * context on every exit, including success, cancellation and compilation errors.
 */
export async function renderStudio(
  snapshot: RenderSnapshot,
  options: RenderOptions,
  context: RenderContext,
): Promise<RenderResult> {
  const { canvas, signal, onProgress } = context;
  const started = performance.now();
  const mobile = matchMedia("(max-width:700px)").matches;
  const { width, height } = outputDimensions(
    options.resolution,
    options.aspect,
    mobile,
  );
  const longEdge = Math.max(width, height);
  const tiles = renderTiles(
    width,
    height,
    longEdge <= 2048 ? longEdge : 1024,
    longEdge <= 2048 ? 0 : 12,
  );
  const format = options.format || "png";
  const working = document.createElement("canvas");
  working.className = "studio-render-canvas studio-render-worker";
  const assembled = canvas.getContext("2d", { alpha: format !== "jpeg" });
  if (!assembled) {
    snapshot.dispose();
    throw new Error("Çıktı tuvali hazırlanamadı.");
  }
  canvas.width = width;
  canvas.height = height;
  // CPU output may be 8K; float GPU buffers remain tile-sized.
  try {
    assembled.getImageData(width - 1, height - 1, 1, 1);
  } catch {
    snapshot.dispose();
    canvas.width = canvas.height = 1;
    throw new Error(
      "Bu cihaz seçilen çıktı boyutunu oluşturamıyor. Daha küçük boyut seçin.",
    );
  }
  let completedTiles = 0;
  const total = options.quality === "fine" ? 256 : 64;
  let renderer: THREE.WebGLRenderer | null = null;
  let rawContext: WebGL2RenderingContext | null = null;
  let tracer: PathTracer | null = null;
  let environment: THREE.DataTexture | null = null;
  let background: THREE.DataTexture | null = null;
  let floor: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshPhysicalMaterial
  > | null = null;
  const pendingCompiles = new Set<Promise<THREE.Object3D>>();
  let finalizing = false;
  let lost = false;
  let shaderError: Error | null = null;
  const assertActive = () => {
    if (signal?.aborted) throw abortError();
    if (lost)
      throw new Error(
        "Grafik bağlantısı kesildi. Daha düşük çözünürlükle yeniden deneyin.",
      );
    if (shaderError) throw shaderError;
  };
  const report = (
    stage: "preparing" | "rendering" | "encoding",
    samples = 0,
  ) => {
    onProgress?.({
      stage,
      samples: (completedTiles * total + samples) / tiles.length,
      total,
      percent: Math.min(
        100,
        ((completedTiles + samples / total) / tiles.length) * 100,
      ),
      elapsedMs: performance.now() - started,
    });
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    lost = true;
  };
  working.addEventListener("webglcontextlost", contextLost);
  const abortGpu = () =>
    rawContext?.getExtension("WEBGL_lose_context")?.loseContext();
  signal?.addEventListener("abort", abortGpu, { once: true });
  try {
    assertActive();
    report("preparing");
    await frame(signal);
    assertActive();
    const { WebGLPathTracer, DenoiseMaterial } =
      await import("three-gpu-pathtracer");
    assertActive();
    const gl = working.getContext("webgl2", {
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
    rawContext = gl;
    if (!gl || gl.isContextLost())
      throw new Error(
        "Stüdyo renderı WebGL 2 gerektirir. Bu tarayıcıda desteklenmiyor.",
      );
    if (!gl.getExtension("EXT_color_buffer_float"))
      throw new Error(
        "Bu cihaz fiziksel render için gereken float render hedeflerini desteklemiyor.",
      );
    if (
      Math.max(tiles[0].renderWidth, tiles[0].renderHeight) >
      Math.min(
        gl.getParameter(gl.MAX_TEXTURE_SIZE),
        gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      )
    )
      throw new Error("Seçilen çözünürlük bu cihazın doku sınırını aşıyor.");
    renderer = new THREE.WebGLRenderer({
      canvas: working,
      context: gl,
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(tiles[0].renderWidth, tiles[0].renderHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure =
      Math.min(1.25, Math.max(0.75, snapshot.settings.exposure || 1)) * 0.85;
    renderer.setClearColor(0x000000, 0);
    renderer.debug.onShaderError = () => {
      shaderError = new Error(
        "Grafik sürücüsü render shaderını derleyemedi. Başka bir tarayıcı veya cihaz deneyin.",
      );
    };
    // The tracer can start overlapping compilations. Use the same native
    // compile/program-readiness checks as Three, with a stoppable poll: Three
    // 180's compileAsync otherwise polls forever when a lost GPU returns null.
    // All programs stay alive until EVERY poll has ended before disposal.
    renderer.compileAsync = (...args) => {
      const materials = renderer!.compile(...args);
      const promise = new Promise<THREE.Object3D>((resolve) => {
        const checkReady = () => {
          if (finalizing || signal?.aborted || lost || gl.isContextLost()) {
            if (gl.isContextLost()) lost = true;
            // GPU work cannot complete after device loss. Stop polling now;
            // assertActive reports the real context-loss error for the job.
            resolve(args[0]);
            return;
          }
          try {
            for (const material of materials) {
              const properties = renderer!.properties.get(material) as {
                currentProgram?: { isReady: () => boolean };
              };
              const program = properties.currentProgram;
              if (!program)
                throw new Error("Render shader programı oluşturulamadı.");
              if (program.isReady()) materials.delete(material);
            }
          } catch (error) {
            shaderError =
              error instanceof Error
                ? error
                : new Error("Render shaderı derlenemedi.");
            // End internal polling; the render loop throws this error through
            // assertActive rather than an unhandled timer/third-party promise.
            resolve(args[0]);
            return;
          }
          if (materials.size === 0) resolve(args[0]);
          else setTimeout(checkReady, 10);
        };
        checkReady();
      });
      pendingCompiles.add(promise);
      promise.then(
        () => pendingCompiles.delete(promise),
        (error: unknown) => {
          pendingCompiles.delete(promise);
          shaderError =
            error instanceof Error
              ? error
              : new Error("Render shaderı derlenemedi.");
        },
      );
      return promise;
    };
    const scene = new THREE.Scene();
    scene.add(snapshot.product);
    snapshot.product.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(snapshot.product);
    if (bounds.isEmpty() || !Number.isFinite(bounds.min.x))
      throw new Error("Renderlanacak ürün geometrisi bulunamadı.");
    const studio = createStudioEnvironment(options.studio, bounds, mobile);
    environment = studio.environment;
    scene.environment = environment;
    scene.environmentIntensity = 1;
    scene.add(...studio.lights);
    const warm = options.background === "warm";
    background =
      options.background === "transparent"
        ? null
        : createStudioBackground(warm);
    scene.background = background;
    scene.backgroundIntensity = 4;
    if (options.background !== "transparent" && options.floorShadow !== false) {
      const backdrop = createStudioBackdrop(bounds, snapshot.camera, warm);
      floor = backdrop.mesh;
      scene.add(floor, backdrop.light);
    }
    fitAspect(snapshot.camera, bounds, width / height);
    assertActive();
    await frame(signal);
    assertActive();
    tracer = new WebGLPathTracer(renderer);
    const pixelOffset = configureRenderSampling(tracer);
    tracer.tiles.set(2, 2);
    let transmissive = false;
    snapshot.product.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material])
        if (
          material instanceof THREE.MeshPhysicalMaterial &&
          material.transmission > 0
        )
          transmissive = true;
    });
    tracer.bounces = options.quality === "fine" ? 10 : transmissive ? 6 : 4;
    tracer.transmissiveBounces = 4;
    tracer.multipleImportanceSampling = true;
    tracer.filterGlossyFactor = options.quality === "fine" ? 0.2 : 0.35;
    const textureSources = new Set<THREE.Texture>();
    snapshot.product.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material])
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) textureSources.add(value);
    });
    const largestTexture = Math.max(
      64,
      ...[...textureSources].map((texture) =>
        Math.max(texture.image?.width || 1, texture.image?.height || 1),
      ),
    );
    const atlasBudget = mobile ? 32 * 1024 ** 2 : 128 * 1024 ** 2;
    const budgetEdge =
      2 **
      Math.floor(
        Math.log2(
          Math.sqrt(atlasBudget / (Math.max(1, textureSources.size) * 4)),
        ),
      );
    tracer.textureSize.setScalar(
      Math.min(
        renderTextureSize(longEdge, mobile),
        2 ** Math.ceil(Math.log2(largestTexture)),
        budgetEdge,
      ),
    );
    tracer.renderDelay = 0;
    tracer.minSamples = 1;
    tracer.fadeDuration = 0;
    tracer.dynamicLowRes = false;
    tracer.rasterizeScene = false;
    tracer.renderToCanvas = true;
    assertActive();
    tracer.setScene(scene, snapshot.camera);
    assertActive();
    await frame(signal);
    assertActive();
    for (const tile of tiles) {
      assertActive();
      renderer.setSize(tile.renderWidth, tile.renderHeight, false);
      // WebGL fragment coordinates start at bottom-left, output tiles at top-left.
      pixelOffset(tile.renderX, height - tile.renderY - tile.renderHeight);
      if (tiles.length > 1)
        snapshot.camera.setViewOffset(
          width,
          height,
          tile.renderX,
          tile.renderY,
          tile.renderWidth,
          tile.renderHeight,
        );
      tracer.setCamera(snapshot.camera);
      // setCamera queues its reset; apply it before inspecting the sample count
      // or a completed previous tile would make the next tile skip its work.
      tracer.renderToCanvas = false;
      tracer.renderSample();
      let previous = -1,
        lastAdvance = performance.now();
      while (tracer.samples < total) {
        assertActive();
        // One complete sample per UI turn, rather than one of its four tiles.
        // Composite only the last tile. A GPU fence bounds queued work, keeping
        // cancellation responsive even when CPU submission is much faster than GL.
        for (let tile = 0; tile < 4 && tracer.samples < total; tile++) {
          tracer.renderToCanvas = tile === 3;
          const before = tracer.samples;
          tracer.renderSample();
          assertActive();
          if (tracer.samples === before) break; // asynchronous shader compilation
        }
        const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (fence) {
          try {
            gl.flush();
            const submitted = performance.now();
            let status = gl.clientWaitSync(fence, 0, 0);
            while (status === gl.TIMEOUT_EXPIRED) {
              assertActive();
              if (performance.now() - submitted > 60000)
                throw new Error(
                  "GPU yanıt vermedi. Daha düşük çözünürlükle yeniden deneyin.",
                );
              await frame(signal);
              status = gl.clientWaitSync(fence, 0, 0);
            }
            if (status === gl.WAIT_FAILED)
              throw new Error(
                "GPU işlemi tamamlanamadı. Renderı yeniden başlatın.",
              );
          } finally {
            gl.deleteSync(fence);
          }
        }
        assertActive();
        const samples = tracer.samples;
        if (samples > previous) {
          previous = samples;
          lastAdvance = performance.now();
        }
        if (performance.now() - lastAdvance > 120000)
          throw new Error(
            "Grafik sürücüsü renderı ilerletemedi. Daha düşük çözünürlükle yeniden deneyin.",
          );
        report(samples > 0 ? "rendering" : "preparing", samples);
        await frame(signal);
      }
      assertActive();
      await frame(signal);
      assertActive();
      renderDenoisedResult(
        renderer,
        scene,
        snapshot.camera,
        tracer.target.texture,
        tile.renderWidth,
        tile.renderHeight,
        options.quality === "fine",
        DenoiseMaterial,
      );
      assertActive();
      // Copy only the tile interior: overlap is for filtering, never upscaling.
      if (format === "jpeg") {
        assembled.fillStyle =
          options.background === "warm" ? "#f4ece1" : "#ffffff";
        assembled.fillRect(tile.x, tile.y, tile.width, tile.height);
      } else assembled.clearRect(tile.x, tile.y, tile.width, tile.height);
      assembled.drawImage(
        working,
        tile.x - tile.renderX,
        tile.y - tile.renderY,
        tile.width,
        tile.height,
        tile.x,
        tile.y,
        tile.width,
        tile.height,
      );
      completedTiles++;
      report("rendering", 0);
      await frame(signal);
    }
    snapshot.camera.clearViewOffset();
    report("encoding", 0);
    const blob = await encode(canvas, format, signal);
    assertActive();
    return {
      blob,
      width,
      height,
      samples: total,
      seconds: (performance.now() - started) / 1000,
      engine: "path-tracing",
    };
  } finally {
    // Stop every readiness poll before deleting its programs. Some drivers never
    // finish compilation and cannot lose their context; cleanup must still end
    // after cancellation, a shader error, or the render-loop stall timeout.
    finalizing = true;
    while (pendingCompiles.size) await Promise.allSettled([...pendingCompiles]);
    // 0.0.24's public disposer does not close the low-res helper. It is disabled
    // for rendering here, but its allocated targets still require disposal.
    if (tracer) {
      const internals = tracer as unknown as {
        _lowResPathTracer?: { dispose: () => void };
        _generator?: { geometry?: THREE.BufferGeometry };
        _colorBackground?: THREE.Texture;
      };
      try {
        tracer.dispose();
      } catch {
        /* A lost context may interrupt cleanup. */
      }
      try {
        internals._lowResPathTracer?.dispose();
        internals._generator?.geometry?.dispose();
        internals._colorBackground?.dispose();
      } catch {
        /* The fresh GL context is also released below. */
      }
    }
    try {
      floor?.geometry.dispose();
      floor?.material.dispose();
      environment?.dispose();
      background?.dispose();
      snapshot.dispose();
    } finally {
      try {
        if (renderer) {
          try {
            renderer.dispose();
          } finally {
            renderer.forceContextLoss();
          }
        } else rawContext?.getExtension("WEBGL_lose_context")?.loseContext();
      } finally {
        working.removeEventListener("webglcontextlost", contextLost);
        signal?.removeEventListener("abort", abortGpu);
        working.width = working.height = 1;
        // The returned Blob owns the completed image. Drop the large CPU
        // assembly buffer as well, especially for cancelled/finished 8K jobs.
        canvas.width = canvas.height = 1;
      }
    }
  }
}

export { renderStudio as RenderStudio };
